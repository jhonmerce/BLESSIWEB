import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { asyncRoute } from '../lib/http.js';
import { dateFromQuery } from '../lib/pagination.js';
import { requireRole } from '../lib/roles.js';

export function createAnalyticsRouter(db: PrismaClient) {
  const router = Router();
  router.get(
    '/dashboard',
    requireRole('ADMIN'),
    asyncRoute(async (_q, r) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const [
        sales,
        purchases,
        expenses,
        fuel,
        daySales,
        allSales,
        allExpenses,
        recentSales,
        recentPurchases,
        recentExpenses,
      ] = await Promise.all(
        [
          db.vente.aggregate({
            where: { date: { gte: start, lt: end } },
            _sum: { montantUSD: true },
          }),
          db.achat.aggregate({
            where: { date: { gte: start, lt: end } },
            _sum: { montantUSD: true },
          }),
          db.depense.aggregate({
            where: { date: { gte: start, lt: end } },
            _sum: { montantUSD: true },
          }),
          db.carburant.findMany(),
          db.vente.findMany({
            where: { date: { gte: start, lt: end } },
            select: { beneficeUSD: true },
          }),
          db.vente.findMany({
            where: { date: { gte: new Date(Date.now() - 7 * 86400000) } },
            select: { date: true, montant: true, montantUSD: true },
          }),
          db.depense.findMany({
            where: { date: { gte: start, lt: end } },
            include: { categorie: true },
          }),
          db.vente.findMany({
            take: 2,
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            include: { carburant: true, chauffeur: true },
          }),
          db.achat.findMany({
            take: 1,
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            include: { carburant: true },
          }),
          db.depense.findMany({
            take: 1,
            orderBy: [{ date: 'desc' }, { id: 'desc' }],
            include: { categorie: true },
          }),
        ],
      );
      const revenu = Number(sales._sum.montantUSD || 0),
        achat = Number(purchases._sum.montantUSD || 0),
        depense = Number(expenses._sum.montantUSD || 0),
        beneficeBrut = daySales.reduce((sum, sale) => sum + Number(sale.beneficeUSD), 0);
      r.json({
        revenu,
        achats: achat,
        depenses: depense,
        beneficeBrut,
        benefice: beneficeBrut - depense,
        stockTotal: fuel.reduce((n, f) => n + Number(f.stock), 0),
        devise: 'USD',
        stocks: fuel,
        ventes: allSales,
        depensesCategories: allExpenses,
        operationsRecentes: {
          ventes: recentSales,
          achats: recentPurchases,
          depenses: recentExpenses,
        },
      });
    }),
  );
  router.get(
    '/rapports',
    asyncRoute(async (q, r) => {
      const de =
        dateFromQuery(q.query.de) ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const a = dateFromQuery(q.query.a, true) ?? new Date();
      const [ventes, achats, depenses] = await Promise.all([
        db.vente.findMany({
          where: { date: { gte: de, lte: a } },
          include: { carburant: true },
          orderBy: { date: 'desc' },
        }),
        db.achat.findMany({
          where: { date: { gte: de, lte: a } },
          include: { carburant: true },
          orderBy: { date: 'desc' },
        }),
        db.depense.findMany({
          where: { date: { gte: de, lte: a } },
          include: { categorie: true },
          orderBy: { date: 'desc' },
        }),
      ]);
      const sum = (xs: { montantUSD: Prisma.Decimal }[]) =>
        xs.reduce((n, x) => n + Number(x.montantUSD), 0);
      const beneficeBrut = ventes.reduce((n, v) => n + Number(v.beneficeUSD), 0);
      r.json({
        ventes,
        achats,
        depenses,
        chiffreAffaires: sum(ventes),
        totalAchats: sum(achats),
        totalDepenses: sum(depenses),
        beneficeBrut,
        beneficeNet: beneficeBrut - sum(depenses),
        devise: 'USD',
      });
    }),
  );
  router.get(
    '/exports/:type',
    asyncRoute(async (q, r) => {
      const type = q.params.type;
      if (!['achats', 'ventes', 'depenses', 'mouvements-stock'].includes(type))
        return r.status(404).json({ error: 'Export indisponible.' });
      const data =
        type === 'achats'
          ? await db.achat.findMany({ include: { carburant: true } })
          : type === 'ventes'
            ? await db.vente.findMany({ include: { carburant: true } })
            : type === 'depenses'
              ? await db.depense.findMany({ include: { categorie: true } })
              : await db.mouvementStock.findMany({ include: { carburant: true } });
      r.json(data);
    }),
  );
  router.post(
    '/import/sqlite',
    asyncRoute(async (_q, r) =>
      r.status(501).json({ error: 'Import reserved: run the SQLite import script.' }),
    ),
  );
  return router;
}
