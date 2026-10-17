import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const email = process.env.ADMIN_EMAIL?.trim();
const password = process.env.ADMIN_PASSWORD;
const databaseUrl = process.env.DIRECT_URL;

if (!email || !password || password.length < 12 || !databaseUrl) {
  throw new Error(
    'Définissez ADMIN_EMAIL, DIRECT_URL et un ADMIN_PASSWORD de 12 caractères minimum dans server/.env.',
  );
}

const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

try {
  const motDePasse = await bcrypt.hash(password, 12);
  const account = await db.utilisateur.findUnique({ where: { email } });
  if (account) {
    if (account.role !== 'ADMIN') {
      throw new Error('ADMIN_EMAIL est associé au compte gérant, pas au compte administrateur.');
    }
    await db.utilisateur.update({ where: { id: account.id }, data: { motDePasse } });
  } else {
    const administrators = await db.utilisateur.findMany({ where: { role: 'ADMIN' }, take: 2 });
    if (administrators.length > 1) {
      throw new Error(
        'Plusieurs comptes administrateur existent. Mettez ADMIN_EMAIL à jour pour désigner celui à réinitialiser.',
      );
    }
    if (administrators.length === 1) {
      await db.utilisateur.update({
        where: { id: administrators[0].id },
        data: { email, motDePasse },
      });
    } else {
      await db.utilisateur.create({ data: { email, motDePasse, role: 'ADMIN' } });
    }
  }

  console.log(`Mot de passe administrateur réinitialisé pour ${email}.`);
} finally {
  await db.$disconnect();
}
