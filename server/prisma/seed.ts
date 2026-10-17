import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const email = z.string().email().parse(process.env.ADMIN_EMAIL?.trim());
const password = z
  .string()
  .min(12, 'ADMIN_PASSWORD doit contenir au moins 12 caractères.')
  .parse(process.env.ADMIN_PASSWORD);

const db = new PrismaClient();

async function main() {
  const account = await db.utilisateur.findUnique({ where: { email } });
  if (account && account.role !== 'ADMIN') {
    throw new Error(
      'ADMIN_EMAIL est déjà associé à un compte gérant. Choisissez une autre adresse.',
    );
  }
  if (!account) {
    const administrators = await db.utilisateur.findMany({ where: { role: 'ADMIN' }, take: 2 });
    if (administrators.length > 1) {
      throw new Error('Plusieurs comptes administrateur existent déjà.');
    }
    if (administrators.length === 0) {
      await db.utilisateur.create({
        data: { email, motDePasse: await bcrypt.hash(password, 12), role: 'ADMIN' },
      });
    }
  }

  for (const [nom, couleur, prixVente] of [
    ['Essence SP95', '#4169e1', 1.45],
    ['Essence SP98', '#8b5cf6', 1.6],
    ['Gasoil', '#f59e0b', 1.35],
    ['Super Ethanol', '#10b981', 0.85],
  ] as const) {
    await db.carburant.upsert({ where: { nom }, update: {}, create: { nom, couleur, prixVente } });
  }

  for (const nom of [
    'Salaires',
    'Transport',
    'Maintenance',
    'Taxes',
    'Électricité',
    'Eau',
    'Assurance',
    'Fournitures',
    'Autres',
  ]) {
    await db.categorieDepense.upsert({ where: { nom }, update: {}, create: { nom } });
  }

  if (!(await db.parametre.count())) await db.parametre.create({ data: {} });
}

main()
  .catch((error: unknown) => {
    console.error('Échec du seed.', error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
