import { Router } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { asyncRoute } from '../lib/http.js';

export function createSettingsRouter(db: PrismaClient) {
  const router = Router();
  const currencies = ['USD', 'CDF'] as const;
  router.get(
    '/parametres',
    asyncRoute(async (_q, r) => {
      const saved = await db.parametre.findFirst();
      r.json({ ...saved, devise: saved?.devise === 'CDF' ? 'CDF' : 'USD' });
    }),
  );
  router.patch(
    '/parametres',
    asyncRoute(async (q, r) => {
      const s = z.object({ devise: z.enum(currencies) }).parse(q.body);
      const p = await db.parametre.findFirst();
      r.json(
        p
          ? await db.parametre.update({ where: { id: p.id }, data: s })
          : await db.parametre.create({ data: s }),
      );
    }),
  );
  router.get(
    '/parametres/taux',
    asyncRoute(async (_q, r) =>
      r.json(await db.tauxJournalier.findMany({ orderBy: [{ date: 'desc' }, { deviseCible: 'asc' }] })),
    ),
  );
  router.post(
    '/parametres/taux',
    asyncRoute(async (q, r) => {
      const input = z
        .object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          deviseCible: z.literal('CDF'),
          taux: z.number().finite().positive(),
        })
        .parse(q.body);
      const date = new Date(`${input.date}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.date)
        return r.status(400).json({ error: 'La date du taux est invalide.' });
      const rate = await db.tauxJournalier.upsert({
        where: {
          date_deviseSource_deviseCible: {
            date,
            deviseSource: 'USD',
            deviseCible: input.deviseCible,
          },
        },
        update: { taux: input.taux },
        create: { date, deviseSource: 'USD', deviseCible: input.deviseCible, taux: input.taux },
      });
      r.status(200).json(rate);
    }),
  );
  return router;
}
