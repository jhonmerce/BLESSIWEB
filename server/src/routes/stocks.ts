import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { asyncRoute } from '../lib/http.js';
import { stockStatus } from '../domain.js';

export function createStocksRouter(db: PrismaClient) {
  const router = Router();
  router.get(
    '/stocks',
    asyncRoute(async (_q, r) => {
      const a = await db.carburant.findMany({ orderBy: { nom: 'asc' } });
      r.json(
        a.map((x) => ({
          ...x,
          statut: stockStatus(Number(x.stock)),
          valeurStock: Number(x.stock) * Number(x.prixVente),
        })),
      );
    }),
  );
  router.get(
    '/mouvements-stock',
    asyncRoute(async (_q, r) => {
      const movements = await db.mouvementStock.findMany({
        include: { carburant: true, chauffeur: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 100,
      });
      const purchaseIds = movements
        .filter((movement) => movement.type === 'ACHAT')
        .map((movement) => movement.referenceId);
      const saleIds = movements
        .filter((movement) => movement.type === 'VENTE')
        .map((movement) => movement.referenceId);
      const [purchases, sales] = await Promise.all([
        db.achat.findMany({ where: { id: { in: purchaseIds } }, select: { id: true, montant: true } }),
        db.vente.findMany({ where: { id: { in: saleIds } }, select: { id: true, montant: true } }),
      ]);
      const amounts = new Map(
        [...purchases, ...sales].map((operation) => [operation.id, operation.montant]),
      );
      r.json(movements.map((movement) => ({ ...movement, montant: amounts.get(movement.referenceId) })));
    }),
  );
  return router;
}
