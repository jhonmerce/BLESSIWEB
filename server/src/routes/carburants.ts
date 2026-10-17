import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { asyncRoute, positive, text } from '../lib/http.js';

export function createCarburantsRouter(db: PrismaClient) {
  const router = Router();
  router.get(
    '/carburants',
    asyncRoute(async (_q, r) => r.json(await db.carburant.findMany({ orderBy: { nom: 'asc' } }))),
  );
  router.patch(
    '/carburants/:id',
    asyncRoute(async (q, r) => {
      const s = z
        .object({
          nom: text(2, 80).optional(),
          couleur: z
            .string()
            .trim()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          prixVente: positive.optional(),
        })
        .parse(q.body);
      r.json(await db.carburant.update({ where: { id: q.params.id }, data: s }));
    }),
  );
  router.post(
    '/carburants',
    asyncRoute(async (q, r) => {
      const s = z
        .object({
          nom: text(2, 80),
          couleur: z
            .string()
            .trim()
            .regex(/^#[0-9a-fA-F]{6}$/),
          prixVente: positive,
        })
        .parse(q.body);
      r.status(201).json(await db.carburant.create({ data: s }));
    }),
  );
  return router;
}
