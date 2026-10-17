import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { ApiError, asyncRoute, date, optionalText, positive, text } from '../lib/http.js';
import { nextDriverFuelBalance, total, weightedAveragePrice } from '../domain.js';
import { amountInUSD, convertedAmount, conversionForDate } from '../lib/currency.js';
import {
  idempotencyKey as parseIdempotencyKey,
  isUniqueConstraintError,
  requestHash as hashRequest,
} from '../lib/idempotency.js';
import { dateFromQuery, paginationFromQuery } from '../lib/pagination.js';

export function createChauffeursRouter(db: PrismaClient) {
  const router = Router();

  router.get(
    '/entreprises',
    asyncRoute(async (_q, r) =>
      r.json(
        await db.entreprise.findMany({
          include: { _count: { select: { chauffeurs: true } } },
          orderBy: { nom: 'asc' },
        }),
      ),
    ),
  );
  router.post(
    '/entreprises',
    asyncRoute(async (q, r) => {
      const input = z
        .object({
          nom: text(2, 120),
          telephone: optionalText(40),
        })
        .parse(q.body);
      r.status(201).json(await db.entreprise.create({ data: input }));
    }),
  );

  router.get(
    '/chauffeurs',
    asyncRoute(async (_q, r) =>
      r.json(
        await db.chauffeur.findMany({
          where: { actif: true },
          include: {
            entreprise: true,
            soldes: { include: { carburant: true }, orderBy: { carburant: { nom: 'asc' } } },
          },
          orderBy: [{ entreprise: { nom: 'asc' } }, { nom: 'asc' }],
        }),
      ),
    ),
  );
  router.post(
    '/chauffeurs',
    asyncRoute(async (q, r) => {
      const input = z
        .object({
          entrepriseId: z.string().min(1),
          nom: text(2, 120),
          telephone: text(5, 40),
          plaque: text(2, 30),
          marque: text(2, 80),
        })
        .parse(q.body);
      r.status(201).json(await db.chauffeur.create({ data: input, include: { entreprise: true } }));
    }),
  );
  router.get(
    '/chauffeurs/:id/mouvements',
    asyncRoute(async (q, r) => {
      const pagination = paginationFromQuery(q.query) ?? { page: 1, pageSize: 50 };
      const carburantId = q.query.carburantId;
      if (
        carburantId !== undefined &&
        (typeof carburantId !== 'string' || carburantId.length > 64)
      ) {
        throw new ApiError('Le type de carburant sélectionné est invalide.', 400);
      }
      const debut = dateFromQuery(q.query.debut);
      const fin = dateFromQuery(q.query.fin, true);
      if (debut && fin && debut > fin) {
        throw new ApiError('La date de début doit précéder la date de fin.', 400);
      }

      const where = {
        chauffeurId: q.params.id,
        ...(carburantId ? { carburantId } : {}),
        ...(debut || fin
          ? { date: { ...(debut ? { gte: debut } : {}), ...(fin ? { lte: fin } : {}) } }
          : {}),
      };
      const [data, totalCount] = await db.$transaction([
        db.mouvementCompte.findMany({
          where,
          // Première page = premier mouvement enregistré, puis progression vers le plus récent.
          orderBy: [{ date: 'asc' }, { creeLe: 'asc' }, { id: 'asc' }],
          skip: (pagination.page - 1) * pagination.pageSize,
          take: pagination.pageSize,
          include: { carburant: true, chauffeur: { include: { entreprise: true } } },
        }),
        db.mouvementCompte.count({ where }),
      ]);
      r.json({
        data,
        total: totalCount,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(totalCount / pagination.pageSize),
      });
    }),
  );
  router.post(
    '/chauffeurs/:id/approvisionnements',
    asyncRoute(async (q, r) => {
      const input = z
        .object({
          carburantId: z.string().min(1),
          quantite: positive,
          prixUnitaire: positive,
          devise: z.enum(['USD', 'CDF']),
          date,
          description: optionalText(250),
        })
        .parse(q.body);
      const idempotencyKey = parseIdempotencyKey(q.get('Idempotency-Key'));
      const requestHash = hashRequest({ chauffeurId: q.params.id, ...input });
      const findPreviousFunding = () =>
        db.mouvementCompte.findUnique({
          where: { idempotencyKey },
          include: { chauffeur: { include: { entreprise: true } }, carburant: true },
        });
      const previous = await findPreviousFunding();
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new ApiError('Cette clé a déjà été utilisée pour un autre approvisionnement.', 409);
        return r.status(200).json({
          chauffeur: previous.chauffeur,
          carburant: previous.carburant,
          soldeAvantLitres: Number(previous.soldeLitres || 0) - Number(previous.quantite || 0),
          soldeLitres: previous.soldeLitres,
          mouvement: previous,
        });
      }

      try {
        const result = await db.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT "id" FROM "Chauffeur" WHERE "id" = ${q.params.id} FOR UPDATE`;
            const chauffeur = await tx.chauffeur.findUniqueOrThrow({ where: { id: q.params.id } });
            if (!chauffeur.actif) throw new ApiError('Ce compte chauffeur est désactivé.', 409);
            await tx.$queryRaw`SELECT "id" FROM "Carburant" WHERE "id" = ${input.carburantId} FOR UPDATE`;
            const carburant = await tx.carburant.findUniqueOrThrow({
              where: { id: input.carburantId },
            });
            const conversion = await conversionForDate(tx, input.date, input.devise);
            const montant = total(input.quantite, input.prixUnitaire);
            const montantUSD = amountInUSD(montant, input.devise, conversion.rate);
            const montantCDF =
              input.devise === 'CDF' ? montant : convertedAmount(montant, conversion.rate);
            const stockChange = await tx.carburant.updateMany({
              where: { id: carburant.id, stock: { gte: input.quantite } },
              data: { stock: { decrement: input.quantite } },
            });
            if (!stockChange.count) {
              throw new ApiError(
                `Stock insuffisant pour approvisionner ${carburant.nom}. Disponible : ${Number(carburant.stock).toFixed(3)} L.`,
                409,
              );
            }
            const existingBalance = await tx.soldeChauffeurCarburant.findUnique({
              where: {
                chauffeurId_carburantId: {
                  chauffeurId: chauffeur.id,
                  carburantId: carburant.id,
                },
              },
            });
            const oldQuantity = Number(existingBalance?.quantite || 0);
            const newQuantity = nextDriverFuelBalance(
              oldQuantity,
              input.quantite,
              'APPROVISIONNEMENT',
            );
            const averageInventoryCostUSD = Number(carburant.coutMoyenUSD);
            if (averageInventoryCostUSD <= 0) {
              throw new ApiError(
                `Le coût moyen pondéré de ${carburant.nom} est inconnu. Enregistrez un achat avant cet approvisionnement.`,
                409,
              );
            }
            const newAverageCost = weightedAveragePrice(
              oldQuantity,
              Number(existingBalance?.coutMoyenUSD || 0),
              input.quantite,
              averageInventoryCostUSD,
            );
            const newPrepaidPriceUSD = weightedAveragePrice(
              oldQuantity,
              Number(existingBalance?.prixMoyenPrepayUSD || 0),
              input.quantite,
              montantUSD / input.quantite,
            );
            const balance = await tx.soldeChauffeurCarburant.upsert({
              where: {
                chauffeurId_carburantId: {
                  chauffeurId: chauffeur.id,
                  carburantId: carburant.id,
                },
              },
              create: {
                chauffeurId: chauffeur.id,
                carburantId: carburant.id,
                quantite: input.quantite,
                coutMoyenUSD: newAverageCost,
                prixMoyenPrepayUSD: newPrepaidPriceUSD,
              },
              update: {
                quantite: newQuantity,
                coutMoyenUSD: newAverageCost,
                prixMoyenPrepayUSD: newPrepaidPriceUSD,
              },
            });
            const mouvement = await tx.mouvementCompte.create({
              data: {
                chauffeurId: chauffeur.id,
                carburantId: carburant.id,
                type: 'APPROVISIONNEMENT',
                montant,
                devise: input.devise,
                idempotencyKey,
                requestHash,
                date: input.date,
                variationUSD: montantUSD,
                variationCDF: montantCDF,
                soldeUSD: Number(balance.quantite) * newPrepaidPriceUSD,
                soldeCDF:
                  (Number(balance.quantite) * newPrepaidPriceUSD) /
                  (input.devise === 'USD' ? conversion.rate : 1 / conversion.rate),
                tauxUtilise: conversion.rate,
                quantite: input.quantite,
                variationLitres: input.quantite,
                soldeLitres: balance.quantite,
                description: input.description || 'Avance payée par l’entreprise',
              },
            });
            await tx.mouvementStock.create({
              data: {
                carburantId: carburant.id,
                chauffeurId: chauffeur.id,
                type: 'APPROVISIONNEMENT_CHAUFFEUR',
                quantite: input.quantite,
                referenceId: mouvement.id,
                date: input.date,
              },
            });
            return {
              chauffeur: {
                ...chauffeur,
                entreprise: await tx.entreprise.findUniqueOrThrow({
                  where: { id: chauffeur.entrepriseId },
                }),
              },
              carburant,
              soldeAvantLitres: oldQuantity,
              soldeLitres: balance.quantite,
              mouvement,
            };
          },
          { maxWait: 10_000, timeout: 20_000 },
        );
        return r.status(201).json(result);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const retry = await findPreviousFunding();
          if (retry) {
            if (retry.requestHash !== requestHash)
              throw new ApiError(
                'Cette clé a déjà été utilisée pour un autre approvisionnement.',
                409,
              );
            return r.status(200).json({
              chauffeur: retry.chauffeur,
              carburant: retry.carburant,
              soldeAvantLitres: Number(retry.soldeLitres || 0) - Number(retry.quantite || 0),
              soldeLitres: retry.soldeLitres,
              mouvement: retry,
            });
          }
        }
        throw error;
      }
    }),
  );

  return router;
}
