import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import { ApiError, asyncRoute, date, positive, text } from '../lib/http.js';
import {
  nextDriverFuelBalance,
  nextStock,
  profitFromUnitPrices,
  total,
  weightedAveragePrice,
} from '../domain.js';
import { conversionForDate, convertedAmount, amountInUSD } from '../lib/currency.js';
import {
  idempotencyKey as parseIdempotencyKey,
  isUniqueConstraintError,
  requestHash as hashRequest,
} from '../lib/idempotency.js';
import {
  dateFromQuery,
  paginationFromQuery,
  paginationResult,
  searchFromQuery,
} from '../lib/pagination.js';
import { requireRole } from '../lib/roles.js';

function auditSnapshot(value: unknown): Prisma.InputJsonValue {
  const snapshot = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  delete snapshot.idempotencyKey;
  delete snapshot.requestHash;
  return snapshot as Prisma.InputJsonValue;
}

function auditActor(req: {
  user?: { id: string; email: string; impersonatedBy?: { id: string; email: string } };
}) {
  if (!req.user) throw new ApiError('Authentification requise.', 401);
  return {
    acteurId: req.user.impersonatedBy?.id ?? req.user.id,
    acteurEmail: req.user.impersonatedBy
      ? `${req.user.impersonatedBy.email} (mode gérant : ${req.user.email})`
      : req.user.email,
  };
}

export function createOperationsRouter(db: PrismaClient) {
  const router = Router();
  const optionalCustomerText = (maxLength: number) =>
    z.preprocess(
      (value) =>
        value === null || (typeof value === 'string' && value.trim() === '')
          ? undefined
          : value,
      z.string().trim().max(maxLength).optional(),
    );
  const optionalId = z.preprocess(
    (value) => (value === null || value === '' ? undefined : value),
    z.string().optional(),
  );
  router.get(
    '/achats',
    asyncRoute(async (q, r) => {
      const pagination = paginationFromQuery(q.query);
      const search = searchFromQuery(q.query);
      const where: Prisma.AchatWhereInput = {
        date: {
          gte: dateFromQuery(q.query.de),
          lte: dateFromQuery(q.query.a, true),
        },
        carburantId: typeof q.query.carburantId === 'string' ? q.query.carburantId : undefined,
        ...(search
          ? {
              OR: [
                { fournisseur: { contains: search, mode: 'insensitive' } },
                {
                  carburant: {
                    is: { nom: { contains: search, mode: 'insensitive' } },
                  },
                },
              ],
            }
          : {}),
      };
      const options: Prisma.AchatFindManyArgs = {
        where,
        include: { carburant: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        ...(pagination
          ? { skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize }
          : {}),
      };
      const rows = await db.achat.findMany(options);
      if (!pagination) return r.json(rows);
      const [total, aggregate] = await Promise.all([
        db.achat.count({ where }),
        db.achat.aggregate({ where, _sum: { montantUSD: true } }),
      ]);
      r.json(
        paginationResult(rows, total, Number(aggregate._sum.montantUSD || 0), pagination),
      );
    }),
  );
  router.post(
    '/achats',
    asyncRoute(async (q, r) => {
      const idempotencyKey = parseIdempotencyKey(q.get('Idempotency-Key'));
      const s = z
        .object({
          carburantId: z.string(),
          quantite: positive,
          prixUnitaire: positive,
          fournisseur: text(1, 160),
          devise: z.enum(['USD', 'CDF']).default('USD'),
          date,
        })
        .parse(q.body);
      const montant = total(s.quantite, s.prixUnitaire);
      const requestHash = hashRequest(s);

      const existing = await db.achat.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (existing.requestHash !== requestHash)
          return r
            .status(409)
            .json({ error: 'Cette clé a déjà été utilisée pour un autre achat.' });
        return r.status(200).json(existing);
      }

      try {
        const row = await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Carburant" WHERE "id" = ${s.carburantId} FOR UPDATE`;
          const c = await tx.carburant.findUniqueOrThrow({ where: { id: s.carburantId } });
          const conversion = await conversionForDate(tx, s.date, s.devise);
          const a = await tx.achat.create({
            data: {
              ...s,
              montant,
              devise: s.devise,
              montantConverti: convertedAmount(montant, conversion.rate),
              deviseConvertie: conversion.targetCurrency,
              tauxUtilise: conversion.rate,
              montantUSD: amountInUSD(montant, s.devise, conversion.rate),
              idempotencyKey,
              requestHash,
            },
          });
          const oldQuantity = Number(c.stock);
          const newQuantity = oldQuantity + s.quantite;
          const newAverageCost = weightedAveragePrice(
            oldQuantity,
            Number(c.coutMoyenUSD),
            s.quantite,
            Number(a.montantUSD) / s.quantite,
          );
          await tx.carburant.update({
            where: { id: c.id },
            data: { stock: newQuantity, coutMoyenUSD: newAverageCost },
          });
          await tx.mouvementStock.create({
            data: {
              carburantId: c.id,
              type: 'ACHAT',
              quantite: s.quantite,
              referenceId: a.id,
              date: s.date,
            },
          });
          return a;
        });
        return r.status(201).json(row);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const retry = await db.achat.findUnique({ where: { idempotencyKey } });
          if (retry) {
            if (retry.requestHash !== requestHash)
              return r
                .status(409)
                .json({ error: 'Cette clé a déjà été utilisée pour un autre achat.' });
            return r.status(200).json(retry);
          }
        }
        throw error;
      }
    }),
  );
  router.patch(
    '/achats/:id',
    asyncRoute(async (q, r) => {
      const s = z
        .object({
          carburantId: z.string().min(1),
          quantite: positive,
          prixUnitaire: positive,
          fournisseur: text(1, 160),
          devise: z.enum(['USD', 'CDF']),
          date,
        })
        .parse(q.body);
      const actor = auditActor(q);
      const updated = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Achat" WHERE "id" = ${q.params.id} FOR UPDATE`;
        const before = await tx.achat.findUnique({
          where: { id: q.params.id },
          include: { carburant: true },
        });
        if (!before) throw new ApiError('Achat introuvable.', 404);

        const fuelIds = [...new Set([before.carburantId, s.carburantId])].sort();
        for (const fuelId of fuelIds) {
          await tx.$queryRaw`SELECT "id" FROM "Carburant" WHERE "id" = ${fuelId} FOR UPDATE`;
        }
        const laterOutflow = await tx.mouvementStock.findFirst({
          where: {
            carburantId: before.carburantId,
            creeLe: { gt: before.creeLe },
            type: { in: ['VENTE', 'APPROVISIONNEMENT_CHAUFFEUR'] },
          },
          select: { id: true },
        });
        if (laterOutflow) {
          throw new ApiError(
            'Cet achat ne peut pas être modifié : du carburant a déjà été vendu ou transféré après son enregistrement.',
            409,
          );
        }

        const oldFuel = await tx.carburant.findUniqueOrThrow({ where: { id: before.carburantId } });
        const oldQuantity = Number(oldFuel.stock);
        const oldValue = oldQuantity * Number(oldFuel.coutMoyenUSD);
        const remainingQuantity = oldQuantity - Number(before.quantite);
        const remainingValue = oldValue - Number(before.montantUSD);
        if (remainingQuantity < -0.0005 || remainingValue < -0.005) {
          throw new ApiError('Le coût ou le volume de cet achat a déjà été consommé.', 409);
        }
        const removedAverage =
          remainingQuantity > 0 ? Math.max(0, remainingValue) / remainingQuantity : 0;
        await tx.carburant.update({
          where: { id: oldFuel.id },
          data: { stock: Math.max(0, remainingQuantity), coutMoyenUSD: removedAverage },
        });

        const conversion = await conversionForDate(tx, s.date, s.devise);
        const montant = total(s.quantite, s.prixUnitaire);
        const montantUSD = amountInUSD(montant, s.devise, conversion.rate);
        const targetFuel = await tx.carburant.findUniqueOrThrow({
          where: { id: s.carburantId },
        });
        const targetQuantity = Number(targetFuel.stock) + s.quantite;
        const targetAverage = weightedAveragePrice(
          Number(targetFuel.stock),
          Number(targetFuel.coutMoyenUSD),
          s.quantite,
          montantUSD / s.quantite,
        );
        await tx.carburant.update({
          where: { id: targetFuel.id },
          data: { stock: targetQuantity, coutMoyenUSD: targetAverage },
        });

        const after = await tx.achat.update({
          where: { id: before.id },
          data: {
            ...s,
            montant,
            montantConverti: convertedAmount(montant, conversion.rate),
            deviseConvertie: conversion.targetCurrency,
            tauxUtilise: conversion.rate,
            montantUSD,
          },
          include: { carburant: true },
        });
        await tx.mouvementStock.deleteMany({ where: { referenceId: before.id } });
        await tx.mouvementStock.create({
          data: {
            carburantId: after.carburantId,
            type: 'ACHAT',
            quantite: after.quantite,
            referenceId: after.id,
            date: after.date,
          },
        });
        await tx.journalModification.create({
          data: {
            entite: 'ACHAT',
            entiteId: before.id,
            action: 'MODIFICATION',
            ...actor,
            avant: auditSnapshot(before),
            apres: auditSnapshot(after),
          },
        });
        return after;
      });
      r.json(updated);
    }),
  );
  router.delete(
    '/achats/:id',
    asyncRoute(async (q, r) => {
      const actor = auditActor(q);
      try {
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Achat" WHERE "id" = ${q.params.id} FOR UPDATE`;
          const a = await tx.achat.findUnique({ where: { id: q.params.id } });
          if (!a) return;
          await tx.$queryRaw`SELECT "id" FROM "Carburant" WHERE "id" = ${a.carburantId} FOR UPDATE`;
          const sortiePostAchat = await tx.mouvementStock.findFirst({
            where: {
              carburantId: a.carburantId,
              creeLe: { gt: a.creeLe },
              type: { in: ['VENTE', 'APPROVISIONNEMENT_CHAUFFEUR'] },
            },
            select: { id: true },
          });
          if (sortiePostAchat) {
            throw new ApiError(
              'Cet achat ne peut pas être supprimé : du carburant a été vendu ou transféré après lui.',
              409,
            );
          }
          const carburant = await tx.carburant.findUniqueOrThrow({ where: { id: a.carburantId } });
          const stockRestant = Number(carburant.stock) - Number(a.quantite);
          const valeurRestante =
            Number(carburant.stock) * Number(carburant.coutMoyenUSD) - Number(a.montantUSD);
          if (stockRestant < 0 || valeurRestante < -0.005) {
            throw new ApiError(
              'Impossible de supprimer cet achat : le carburant ou son coût a déjà été consommé.',
              409,
            );
          }
          const coutMoyenRestant =
            stockRestant > 0 ? Math.max(0, valeurRestante) / stockRestant : 0;
          const stockChange = await tx.carburant.updateMany({
            where: { id: a.carburantId, stock: { gte: a.quantite } },
            data: { stock: stockRestant, coutMoyenUSD: coutMoyenRestant },
          });
          if (!stockChange.count) {
            throw new ApiError(
              'Impossible de supprimer cet achat : une partie du carburant a déjà été vendue ou transférée à des chauffeurs.',
              409,
            );
          }
          await tx.mouvementStock.deleteMany({ where: { referenceId: a.id } });
          await tx.journalModification.create({
            data: {
              entite: 'ACHAT',
              entiteId: a.id,
              action: 'SUPPRESSION',
              ...actor,
              avant: auditSnapshot(a),
              apres: {},
            },
          });
          const deleted = await tx.achat.deleteMany({ where: { id: a.id } });
          if (deleted.count === 0) throw new Error('ACHAT_ALREADY_DELETED');
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'ACHAT_ALREADY_DELETED') {
          return r.status(204).end();
        }
        throw error;
      }
      r.status(204).end();
    }),
  );
  router.get(
    '/ventes',
    asyncRoute(async (q, r) => {
      const pagination = paginationFromQuery(q.query);
      const search = searchFromQuery(q.query);
      const where: Prisma.VenteWhereInput = {
        date: {
          gte: dateFromQuery(q.query.de),
          lte: dateFromQuery(q.query.a, true),
        },
        carburantId: typeof q.query.carburantId === 'string' ? q.query.carburantId : undefined,
        ...(search
          ? {
              OR: [
                { clientNom: { contains: search, mode: 'insensitive' } },
                { clientTelephone: { contains: search, mode: 'insensitive' } },
                { clientPlaque: { contains: search, mode: 'insensitive' } },
                { clientMarque: { contains: search, mode: 'insensitive' } },
                { carburant: { is: { nom: { contains: search, mode: 'insensitive' } } } },
                {
                  chauffeur: {
                    is: {
                      OR: [
                        { nom: { contains: search, mode: 'insensitive' } },
                        { plaque: { contains: search, mode: 'insensitive' } },
                        { telephone: { contains: search, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      };
      const options: Prisma.VenteFindManyArgs = {
        where,
        include: { carburant: true, chauffeur: { include: { entreprise: true } } },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        ...(pagination
          ? { skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize }
          : {}),
      };
      const rows = await db.vente.findMany(options);
      if (!pagination) return r.json(rows);
      const [total, aggregate] = await Promise.all([
        db.vente.count({ where }),
        db.vente.aggregate({ where, _sum: { montantUSD: true } }),
      ]);
      r.json(
        paginationResult(rows, total, Number(aggregate._sum.montantUSD || 0), pagination),
      );
    }),
  );
  router.post(
    '/ventes',
    asyncRoute(async (q, r) => {
      const s = z
        .object({
          carburantId: z.string(),
          quantite: positive,
          prixUnitaire: positive.optional(),
          devise: z.enum(['USD', 'CDF']).default('USD'),
          chauffeurId: optionalId,
          clientNom: optionalCustomerText(120),
          clientTelephone: z.preprocess(
            (value) =>
              value === null || (typeof value === 'string' && value.trim() === '')
                ? undefined
                : value,
            z.string().trim().max(30).regex(/^[+0-9().\-\s]+$/).optional(),
          ),
          clientPlaque: optionalCustomerText(20),
          clientMarque: optionalCustomerText(60),
          date,
        })
        .parse(q.body);
      const idempotencyKey = parseIdempotencyKey(q.get('Idempotency-Key'));
      const requestHash = hashRequest(s);
      const findPreviousSale = () =>
        db.vente.findUnique({
          where: { idempotencyKey },
          include: { carburant: true, chauffeur: { include: { entreprise: true } } },
        });
      const previous = await findPreviousSale();
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new ApiError('Cette clé a déjà été utilisée pour une autre vente.', 409);
        return r.status(200).json(previous);
      }

      try {
        const row = await db.$transaction(
          async (tx) => {
            if (s.chauffeurId) {
              await tx.$queryRaw`SELECT "id" FROM "Chauffeur" WHERE "id" = ${s.chauffeurId} FOR UPDATE`;
            }
            await tx.$queryRaw`SELECT "id" FROM "Carburant" WHERE "id" = ${s.carburantId} FOR UPDATE`;
            const c = await tx.carburant.findUniqueOrThrow({ where: { id: s.carburantId } });
            const qty = Number(c.stock);
            if (!s.chauffeurId) nextStock(qty, s.quantite, 'VENTE');
            let coutUnitaireUSD = Number(c.coutMoyenUSD);
            let prixAchatReferenceUSD = coutUnitaireUSD;
            const conversion = await conversionForDate(tx, s.date, s.devise);
            let prixUnitaire =
              s.prixUnitaire ??
              (s.devise === 'CDF' ? Number(c.prixVente) / conversion.rate : Number(c.prixVente));
            let montant = total(s.quantite, prixUnitaire);
            let montantUSD = amountInUSD(montant, s.devise, conversion.rate);
            let chauffeur = null;
            let balance = null;
            if (s.chauffeurId) {
              chauffeur = await tx.chauffeur.findUniqueOrThrow({
                where: { id: s.chauffeurId },
                include: { entreprise: true },
              });
              if (!chauffeur.actif)
                throw new ApiError('Le compte de ce chauffeur est désactivé.', 409);
              balance = await tx.soldeChauffeurCarburant.findUnique({
                where: {
                  chauffeurId_carburantId: {
                    chauffeurId: chauffeur.id,
                    carburantId: c.id,
                  },
                },
              });
              if (!balance || Number(balance.quantite) < s.quantite) {
                const availableLitres = Number(balance?.quantite ?? 0);
                throw new ApiError(
                  `Solde insuffisant pour ${chauffeur.nom} en ${c.nom}. Disponible : ${availableLitres.toFixed(3)} L. Approvisionnez son compte pour continuer.`,
                  409,
                );
              }
              coutUnitaireUSD = Number(balance.coutMoyenUSD);
              prixAchatReferenceUSD = coutUnitaireUSD;
              const prepaidPriceUSD = Number(balance.prixMoyenPrepayUSD);
              if (prepaidPriceUSD > 0) {
                prixUnitaire =
                  s.devise === 'USD' ? prepaidPriceUSD : prepaidPriceUSD / conversion.rate;
                montant = total(s.quantite, prixUnitaire);
                montantUSD = amountInUSD(montant, s.devise, conversion.rate);
              }
            }
            if (coutUnitaireUSD <= 0 || prixAchatReferenceUSD <= 0) {
              throw new ApiError(
                'Coût d’achat inconnu pour ce carburant. Enregistrez un achat avant de vendre.',
                409,
              );
            }
            const beneficeUSD = profitFromUnitPrices(
              montantUSD / s.quantite,
              prixAchatReferenceUSD,
              s.quantite,
            );
            const v = await tx.vente.create({
              data: {
                ...s,
                idempotencyKey,
                requestHash,
                prixUnitaire,
                montant,
                devise: s.devise,
                montantConverti: convertedAmount(montant, conversion.rate),
                deviseConvertie: conversion.targetCurrency,
                tauxUtilise: conversion.rate,
                montantUSD,
                coutUnitaireUSD,
                coutTotalUSD: s.quantite * coutUnitaireUSD,
                prixAchatReferenceUSD,
                beneficeUSD,
                chauffeurId: chauffeur?.id,
                debitLitres: chauffeur ? s.quantite : 0,
                soldeChauffeurApres: chauffeur
                  ? nextDriverFuelBalance(Number(balance!.quantite), s.quantite, 'VENTE')
                  : null,
              },
            });
            if (!chauffeur) {
              const changed = await tx.carburant.updateMany({
                where: { id: c.id, stock: { gte: s.quantite } },
                data: { stock: { decrement: s.quantite } },
              });
              if (!changed.count) throw new ApiError('Stock insuffisant.', 409);
            }
            if (chauffeur) {
              const remainingLitres = nextDriverFuelBalance(
                Number(balance!.quantite),
                s.quantite,
                'VENTE',
              );
              const currentBalance = await tx.soldeChauffeurCarburant.update({
                where: { id: balance!.id },
                data: { quantite: remainingLitres },
              });
              await tx.mouvementCompte.create({
                data: {
                  chauffeurId: chauffeur.id,
                  carburantId: c.id,
                  type: 'VENTE',
                  montant,
                  devise: s.devise,
                  variationUSD: -montantUSD,
                  variationCDF:
                    s.devise === 'CDF' ? -montant : -convertedAmount(montant, conversion.rate),
                  soldeUSD: Number(currentBalance.quantite) * Number(balance!.prixMoyenPrepayUSD),
                  soldeCDF:
                    (Number(currentBalance.quantite) * Number(balance!.prixMoyenPrepayUSD)) /
                    (s.devise === 'USD' ? conversion.rate : 1 / conversion.rate),
                  tauxUtilise: conversion.rate,
                  quantite: s.quantite,
                  variationLitres: -s.quantite,
                  soldeLitres: currentBalance.quantite,
                  date: s.date,
                  description: `Vente ${s.quantite} L — ${c.nom}`,
                  referenceVente: v.id,
                },
              });
            }
            if (!chauffeur) {
              await tx.mouvementStock.create({
                data: {
                  carburantId: c.id,
                  type: 'VENTE',
                  quantite: s.quantite,
                  referenceId: v.id,
                  date: s.date,
                },
              });
            }
            return { ...v, carburant: c, chauffeur };
          },
          { maxWait: 10_000, timeout: 20_000 },
        );
        return r.status(201).json(row);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const retry = await findPreviousSale();
          if (retry) {
            if (retry.requestHash !== requestHash)
              throw new ApiError('Cette clé a déjà été utilisée pour une autre vente.', 409);
            return r.status(200).json(retry);
          }
        }
        throw error;
      }
    }),
  );
  router.patch(
    '/ventes/:id',
    asyncRoute(async (q, r) => {
      const s = z
        .object({
          carburantId: z.string().min(1),
          quantite: positive,
          prixUnitaire: positive.optional(),
          devise: z.enum(['USD', 'CDF']),
          chauffeurId: optionalId,
          clientNom: optionalCustomerText(120),
          clientTelephone: z.preprocess(
            (value) =>
              value === null || (typeof value === 'string' && value.trim() === '')
                ? undefined
                : value,
            z.string().trim().max(30).regex(/^[+0-9().\-\s]+$/).optional(),
          ),
          clientPlaque: optionalCustomerText(20),
          clientMarque: optionalCustomerText(60),
          date,
        })
        .parse(q.body);
      const actor = auditActor(q);
      const updated = await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Vente" WHERE "id" = ${q.params.id} FOR UPDATE`;
          const before = await tx.vente.findUnique({
            where: { id: q.params.id },
            include: { carburant: true, chauffeur: { include: { entreprise: true } } },
          });
          if (!before) throw new ApiError('Vente introuvable.', 404);

          const fuelIds = [...new Set([before.carburantId, s.carburantId])].sort();
          for (const fuelId of fuelIds) {
            await tx.$queryRaw`SELECT "id" FROM "Carburant" WHERE "id" = ${fuelId} FOR UPDATE`;
          }
          const driverIds = [...new Set([before.chauffeurId, s.chauffeurId].filter(Boolean))].sort();
          for (const driverId of driverIds) {
            await tx.$queryRaw`SELECT "id" FROM "Chauffeur" WHERE "id" = ${driverId} FOR UPDATE`;
          }

          if (before.chauffeurId) {
            const oldBalance = await tx.soldeChauffeurCarburant.findUnique({
              where: {
                chauffeurId_carburantId: {
                  chauffeurId: before.chauffeurId,
                  carburantId: before.carburantId,
                },
              },
            });
            if (!oldBalance) throw new ApiError('Le solde du chauffeur est introuvable.', 409);
            const oldQuantity = Number(oldBalance.quantite);
            const restoredQuantity = oldQuantity + Number(before.debitLitres);
            const restoredAverage =
              restoredQuantity > 0
                ? (oldQuantity * Number(oldBalance.coutMoyenUSD) + Number(before.coutTotalUSD)) /
                  restoredQuantity
                : 0;
            const restored = await tx.soldeChauffeurCarburant.update({
              where: { id: oldBalance.id },
              data: { quantite: restoredQuantity, coutMoyenUSD: restoredAverage },
            });
            await tx.mouvementCompte.create({
              data: {
                chauffeurId: before.chauffeurId,
                carburantId: before.carburantId,
                type: 'ANNULATION',
                montant: before.montant,
                devise: before.devise,
                variationUSD: before.montantUSD,
                variationCDF:
                  before.devise === 'CDF'
                    ? before.montant
                    : Number(before.montant) * Number(before.tauxUtilise),
                soldeUSD: Number(restored.quantite) * Number(restored.prixMoyenPrepayUSD),
                soldeCDF:
                  (Number(restored.quantite) * Number(restored.prixMoyenPrepayUSD)) /
                  (before.devise === 'CDF'
                    ? 1 / Number(before.tauxUtilise)
                    : Number(before.tauxUtilise)),
                tauxUtilise: before.tauxUtilise,
                quantite: before.debitLitres,
                variationLitres: before.debitLitres,
                soldeLitres: restored.quantite,
                date: new Date(),
                description: `Correction de la vente ${before.id} — annulation de l’ancienne valeur`,
                referenceVente: `CORRECTION:${before.id}:ANNULATION:${crypto.randomUUID()}`,
              },
            });
          } else {
            const oldFuel = await tx.carburant.findUniqueOrThrow({
              where: { id: before.carburantId },
            });
            const restoredStock = Number(oldFuel.stock) + Number(before.quantite);
            const restoredCost =
              (Number(oldFuel.stock) * Number(oldFuel.coutMoyenUSD) +
                Number(before.coutTotalUSD)) /
              restoredStock;
            await tx.carburant.update({
              where: { id: oldFuel.id },
              data: { stock: restoredStock, coutMoyenUSD: restoredCost },
            });
          }

          const fuel = await tx.carburant.findUniqueOrThrow({ where: { id: s.carburantId } });
          const conversion = await conversionForDate(tx, s.date, s.devise);
          let prixUnitaire =
            s.prixUnitaire ??
            (s.devise === 'CDF' ? Number(fuel.prixVente) / conversion.rate : Number(fuel.prixVente));
          let montant = total(s.quantite, prixUnitaire);
          let montantUSD = amountInUSD(montant, s.devise, conversion.rate);
          let coutUnitaireUSD = Number(fuel.coutMoyenUSD);
          let chauffeur: { id: string } | null = null;
          let newBalance: { id: string; quantite: unknown; prixMoyenPrepayUSD: unknown } | null = null;

          if (s.chauffeurId) {
            const selectedDriver = await tx.chauffeur.findUniqueOrThrow({
              where: { id: s.chauffeurId },
            });
            if (!selectedDriver.actif) throw new ApiError('Le compte de ce chauffeur est désactivé.', 409);
            chauffeur = selectedDriver;
            newBalance = await tx.soldeChauffeurCarburant.findUnique({
              where: {
                chauffeurId_carburantId: {
                  chauffeurId: selectedDriver.id,
                  carburantId: fuel.id,
                },
              },
            });
            if (!newBalance || Number(newBalance.quantite) < s.quantite) {
              throw new ApiError(
                `Solde insuffisant pour ${selectedDriver.nom} en ${fuel.nom}. Disponible : ${Number(newBalance?.quantite ?? 0).toFixed(3)} L.`,
                409,
              );
            }
            const accountCost = await tx.soldeChauffeurCarburant.findUniqueOrThrow({
              where: { id: newBalance.id },
              select: { coutMoyenUSD: true },
            });
            coutUnitaireUSD = Number(accountCost.coutMoyenUSD);
            const prepaidUSD = Number(newBalance.prixMoyenPrepayUSD);
            if (prepaidUSD > 0) {
              prixUnitaire = s.devise === 'USD' ? prepaidUSD : prepaidUSD / conversion.rate;
              montant = total(s.quantite, prixUnitaire);
              montantUSD = amountInUSD(montant, s.devise, conversion.rate);
            }
          }
          if (coutUnitaireUSD <= 0) {
            throw new ApiError('Coût moyen d’achat inconnu pour ce carburant.', 409);
          }
          const beneficeUSD = profitFromUnitPrices(
            montantUSD / s.quantite,
            coutUnitaireUSD,
            s.quantite,
          );
          if (!chauffeur) {
            const changed = await tx.carburant.updateMany({
              where: { id: fuel.id, stock: { gte: s.quantite } },
              data: { stock: { decrement: s.quantite } },
            });
            if (!changed.count) throw new ApiError('Stock station insuffisant pour cette vente.', 409);
          } else {
            const afterBalance = await tx.soldeChauffeurCarburant.update({
              where: { id: newBalance!.id },
              data: { quantite: { decrement: s.quantite } },
            });
            await tx.mouvementCompte.create({
              data: {
                chauffeurId: chauffeur.id,
                carburantId: fuel.id,
                type: 'VENTE',
                montant,
                devise: s.devise,
                variationUSD: -montantUSD,
                variationCDF:
                  s.devise === 'CDF' ? -montant : -convertedAmount(montant, conversion.rate),
                soldeUSD: Number(afterBalance.quantite) * Number(newBalance!.prixMoyenPrepayUSD),
                soldeCDF:
                  (Number(afterBalance.quantite) * Number(newBalance!.prixMoyenPrepayUSD)) /
                  (s.devise === 'USD' ? conversion.rate : 1 / conversion.rate),
                tauxUtilise: conversion.rate,
                quantite: s.quantite,
                variationLitres: -s.quantite,
                soldeLitres: afterBalance.quantite,
                date: s.date,
                description: `Vente corrigée ${s.quantite} L — ${fuel.nom}`,
                referenceVente: `CORRECTION:${before.id}:VENTE:${crypto.randomUUID()}`,
              },
            });
          }

          const after = await tx.vente.update({
            where: { id: before.id },
            data: {
              carburantId: fuel.id,
              quantite: s.quantite,
              prixUnitaire,
              montant,
              devise: s.devise,
              montantConverti: convertedAmount(montant, conversion.rate),
              deviseConvertie: conversion.targetCurrency,
              tauxUtilise: conversion.rate,
              montantUSD,
              coutUnitaireUSD,
              coutTotalUSD: s.quantite * coutUnitaireUSD,
              prixAchatReferenceUSD: coutUnitaireUSD,
              beneficeUSD,
              chauffeurId: chauffeur?.id,
              clientNom: chauffeur ? null : s.clientNom,
              clientTelephone: chauffeur ? null : s.clientTelephone,
              clientPlaque: chauffeur ? null : s.clientPlaque,
              clientMarque: chauffeur ? null : s.clientMarque,
              debitLitres: chauffeur ? s.quantite : 0,
              soldeChauffeurApres: chauffeur
                ? Number(newBalance!.quantite) - s.quantite
                : null,
              debitUSD: chauffeur ? montantUSD : 0,
              debitCDF: chauffeur
                ? s.devise === 'CDF'
                  ? montant
                  : convertedAmount(montant, conversion.rate)
                : 0,
              date: s.date,
            },
            include: { carburant: true, chauffeur: { include: { entreprise: true } } },
          });
          await tx.mouvementStock.deleteMany({ where: { referenceId: before.id } });
          if (!chauffeur) {
            await tx.mouvementStock.create({
              data: {
                carburantId: fuel.id,
                type: 'VENTE',
                quantite: s.quantite,
                referenceId: after.id,
                date: s.date,
              },
            });
          }
          await tx.journalModification.create({
            data: {
              entite: 'VENTE',
              entiteId: before.id,
              action: 'MODIFICATION',
              ...actor,
              avant: auditSnapshot(before),
              apres: auditSnapshot(after),
            },
          });
          return after;
        },
        { maxWait: 10_000, timeout: 20_000 },
      );
      r.json(updated);
    }),
  );
  router.delete(
    '/ventes/:id',
    asyncRoute(async (q, r) => {
      const actor = auditActor(q);
      try {
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Vente" WHERE "id" = ${q.params.id} FOR UPDATE`;
          const v = await tx.vente.findUnique({ where: { id: q.params.id } });
          if (!v) return;
          if (v.chauffeurId) {
            await tx.$queryRaw`SELECT "id" FROM "Chauffeur" WHERE "id" = ${v.chauffeurId} FOR UPDATE`;
            const existingBalance = await tx.soldeChauffeurCarburant.findUniqueOrThrow({
              where: {
                chauffeurId_carburantId: {
                  chauffeurId: v.chauffeurId,
                  carburantId: v.carburantId,
                },
              },
            });
            const restoredQuantity = Number(existingBalance.quantite) + Number(v.debitLitres);
            const restoredAverage =
              restoredQuantity > 0
                ? (Number(existingBalance.quantite) * Number(existingBalance.coutMoyenUSD) +
                    Number(v.coutTotalUSD)) /
                  restoredQuantity
                : 0;
            const account = await tx.soldeChauffeurCarburant.update({
              where: {
                chauffeurId_carburantId: {
                  chauffeurId: v.chauffeurId,
                  carburantId: v.carburantId,
                },
              },
              data: { quantite: restoredQuantity, coutMoyenUSD: restoredAverage },
            });
            await tx.mouvementCompte.create({
              data: {
                chauffeurId: v.chauffeurId,
                carburantId: v.carburantId,
                type: 'ANNULATION',
                montant: Number(v.montant),
                devise: v.devise,
                variationUSD: Number(v.montantUSD),
                variationCDF:
                  v.devise === 'CDF'
                    ? Number(v.montant)
                    : Number(v.montant) * Number(v.tauxUtilise),
                soldeUSD: Number(account.quantite) * Number(existingBalance.prixMoyenPrepayUSD),
                soldeCDF:
                  Number(account.quantite) *
                  Number(existingBalance.prixMoyenPrepayUSD) *
                  (v.devise === 'CDF' ? 1 / Number(v.tauxUtilise) : Number(v.tauxUtilise)),
                tauxUtilise: v.tauxUtilise,
                quantite: v.debitLitres,
                variationLitres: v.debitLitres,
                soldeLitres: account.quantite,
                date: v.date,
                description: `Annulation de la vente ${v.id}`,
                referenceVente: `ANNULATION:${v.id}`,
              },
            });
          }
          if (!v.chauffeurId) {
            await tx.$queryRaw`SELECT "id" FROM "Carburant" WHERE "id" = ${v.carburantId} FOR UPDATE`;
            const carburant = await tx.carburant.findUniqueOrThrow({
              where: { id: v.carburantId },
            });
            const stockRestant = Number(carburant.stock) + Number(v.quantite);
            const coutMoyenRestant =
              (Number(carburant.stock) * Number(carburant.coutMoyenUSD) + Number(v.coutTotalUSD)) /
              stockRestant;
            await tx.carburant.update({
              where: { id: v.carburantId },
              data: { stock: stockRestant, coutMoyenUSD: coutMoyenRestant },
            });
          }
          await tx.mouvementStock.deleteMany({ where: { referenceId: v.id } });
          await tx.journalModification.create({
            data: {
              entite: 'VENTE',
              entiteId: v.id,
              action: 'SUPPRESSION',
              ...actor,
              avant: auditSnapshot(v),
              apres: {},
            },
          });
          const deleted = await tx.vente.deleteMany({ where: { id: v.id } });
          if (deleted.count === 0) throw new Error('VENTE_ALREADY_DELETED');
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'VENTE_ALREADY_DELETED') {
          return r.status(204).end();
        }
        throw error;
      }
      r.status(204).end();
    }),
  );
  router.get(
    '/categories-depenses',
    asyncRoute(async (_q, r) =>
      r.json(await db.categorieDepense.findMany({ orderBy: { nom: 'asc' } })),
    ),
  );
  router.post(
    '/categories-depenses',
    asyncRoute(async (q, r) => {
      const s = z.object({ nom: text(2, 60) }).parse(q.body);
      r.status(201).json(await db.categorieDepense.create({ data: s }));
    }),
  );
  router.delete(
    '/categories-depenses/:id',
    asyncRoute(async (q, r) => {
      await db.categorieDepense.delete({ where: { id: q.params.id } });
      r.status(204).end();
    }),
  );
  router.get(
    '/depenses',
    asyncRoute(async (q, r) => {
      const pagination = paginationFromQuery(q.query);
      const search = searchFromQuery(q.query);
      const where: Prisma.DepenseWhereInput = {
        date: {
          gte: dateFromQuery(q.query.de),
          lte: dateFromQuery(q.query.a, true),
        },
        categorieId: typeof q.query.categorieId === 'string' ? q.query.categorieId : undefined,
        ...(search
          ? {
              OR: [
                { description: { contains: search, mode: 'insensitive' } },
                { categorie: { is: { nom: { contains: search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      };
      const options: Prisma.DepenseFindManyArgs = {
        where,
        include: { categorie: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        ...(pagination
          ? { skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize }
          : {}),
      };
      const rows = await db.depense.findMany(options);
      if (!pagination) return r.json(rows);
      const [total, aggregate] = await Promise.all([
        db.depense.count({ where }),
        db.depense.aggregate({ where, _sum: { montantUSD: true } }),
      ]);
      r.json(
        paginationResult(rows, total, Number(aggregate._sum.montantUSD || 0), pagination),
      );
    }),
  );
  router.post(
    '/depenses',
    asyncRoute(async (q, r) => {
      const s = z
        .object({
          categorieId: z.string(),
          description: text(1, 500),
          montant: positive,
          devise: z.enum(['USD', 'CDF']).default('USD'),
          date,
        })
        .parse(q.body);
      const idempotencyKey = parseIdempotencyKey(q.get('Idempotency-Key'));
      const requestHash = hashRequest(s);
      const previous = await db.depense.findUnique({ where: { idempotencyKey } });
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new ApiError('Cette clé a déjà été utilisée pour une autre dépense.', 409);
        return r.status(200).json(previous);
      }

      try {
        const row = await db.$transaction(async (tx) => {
          let category = await tx.categorieDepense.findUnique({ where: { id: s.categorieId } });
          if (!category)
            category = await tx.categorieDepense.upsert({
              where: { nom: s.categorieId },
              update: {},
              create: { nom: s.categorieId },
            });
          const conversion = await conversionForDate(tx, s.date, s.devise);
          return tx.depense.create({
            data: {
              ...s,
              categorieId: category.id,
              idempotencyKey,
              requestHash,
              devise: s.devise,
              montantConverti: convertedAmount(s.montant, conversion.rate),
              deviseConvertie: conversion.targetCurrency,
              tauxUtilise: conversion.rate,
              montantUSD: amountInUSD(s.montant, s.devise, conversion.rate),
            },
          });
        });
        return r.status(201).json(row);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const retry = await db.depense.findUnique({ where: { idempotencyKey } });
          if (retry) {
            if (retry.requestHash !== requestHash)
              throw new ApiError('Cette clé a déjà été utilisée pour une autre dépense.', 409);
            return r.status(200).json(retry);
          }
        }
        throw error;
      }
    }),
  );
  router.patch(
    '/depenses/:id',
    asyncRoute(async (q, r) => {
      const s = z
        .object({
          categorieId: z.string().min(1),
          description: text(1, 500),
          montant: positive,
          devise: z.enum(['USD', 'CDF']),
          date,
        })
        .parse(q.body);
      const actor = auditActor(q);
      const updated = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Depense" WHERE "id" = ${q.params.id} FOR UPDATE`;
        const before = await tx.depense.findUnique({
          where: { id: q.params.id },
          include: { categorie: true },
        });
        if (!before) throw new ApiError('Dépense introuvable.', 404);
        let category = await tx.categorieDepense.findUnique({ where: { id: s.categorieId } });
        if (!category) {
          category = await tx.categorieDepense.upsert({
            where: { nom: s.categorieId },
            update: {},
            create: { nom: s.categorieId },
          });
        }
        const conversion = await conversionForDate(tx, s.date, s.devise);
        const after = await tx.depense.update({
          where: { id: before.id },
          data: {
            categorieId: category.id,
            description: s.description,
            montant: s.montant,
            devise: s.devise,
            montantConverti: convertedAmount(s.montant, conversion.rate),
            deviseConvertie: conversion.targetCurrency,
            tauxUtilise: conversion.rate,
            montantUSD: amountInUSD(s.montant, s.devise, conversion.rate),
            date: s.date,
          },
          include: { categorie: true },
        });
        await tx.journalModification.create({
          data: {
            entite: 'DEPENSE',
            entiteId: before.id,
            action: 'MODIFICATION',
            ...actor,
            avant: auditSnapshot(before),
            apres: auditSnapshot(after),
          },
        });
        return after;
      });
      r.json(updated);
    }),
  );
  router.delete(
    '/depenses/:id',
    asyncRoute(async (q, r) => {
      const actor = auditActor(q);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Depense" WHERE "id" = ${q.params.id} FOR UPDATE`;
        const before = await tx.depense.findUnique({
          where: { id: q.params.id },
          include: { categorie: true },
        });
        if (!before) return;
        await tx.journalModification.create({
          data: {
            entite: 'DEPENSE',
            entiteId: before.id,
            action: 'SUPPRESSION',
            ...actor,
            avant: auditSnapshot(before),
            apres: {},
          },
        });
        await tx.depense.delete({ where: { id: before.id } });
      });
      r.status(204).end();
    }),
  );
  router.get(
    '/journal-modifications',
    requireRole('ADMIN'),
    asyncRoute(async (q, r) => {
      const page = paginationFromQuery(q.query) ?? { page: 1, pageSize: 50 };
      const where: Prisma.JournalModificationWhereInput = {
        entite: typeof q.query.entite === 'string' ? q.query.entite : undefined,
        action: typeof q.query.action === 'string' ? q.query.action : undefined,
        ...(q.query.de || q.query.a
          ? {
              creeLe: {
                ...(dateFromQuery(q.query.de) ? { gte: dateFromQuery(q.query.de) } : {}),
                ...(dateFromQuery(q.query.a, true)
                  ? { lte: dateFromQuery(q.query.a, true) }
                  : {}),
              },
            }
          : {}),
      };
      const [data, total] = await db.$transaction([
        db.journalModification.findMany({
          where,
          orderBy: { creeLe: 'desc' },
          skip: (page.page - 1) * page.pageSize,
          take: page.pageSize,
        }),
        db.journalModification.count({ where }),
      ]);
      r.json({ data, total, page: page.page, pageSize: page.pageSize, totalPages: Math.ceil(total / page.pageSize) });
    }),
  );
  return router;
}
