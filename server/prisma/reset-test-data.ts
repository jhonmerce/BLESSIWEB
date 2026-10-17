import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const confirmation = process.env.CONFIRM_TEST_DATA_RESET;
if (confirmation !== 'RESET_BLESSING_PETROLEUM_TEST_DATA') {
  throw new Error(
    'Pour confirmer la remise à zéro, définissez CONFIRM_TEST_DATA_RESET=RESET_BLESSING_PETROLEUM_TEST_DATA.',
  );
}

const db = new PrismaClient();

try {
  const totals = await db.$transaction(
    async (tx) => {
      const stockMovements = await tx.mouvementStock.deleteMany();
      const accountMovements = await tx.mouvementCompte.deleteMany();
      const sales = await tx.vente.deleteMany();
      const purchases = await tx.achat.deleteMany();
      const expenses = await tx.depense.deleteMany();

      await tx.soldeChauffeurCarburant.updateMany({
        data: {
          quantite: 0,
          coutMoyenUSD: 0,
          prixMoyenPrepayUSD: 0,
        },
      });
      await tx.chauffeur.updateMany({ data: { soldeUSD: 0, soldeCDF: 0 } });
      await tx.carburant.updateMany({ data: { stock: 0, coutMoyenUSD: 0 } });

      return {
        achats: purchases.count,
        ventes: sales.count,
        depenses: expenses.count,
        mouvementsStock: stockMovements.count,
        mouvementsComptesChauffeurs: accountMovements.count,
      };
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  console.log('Données opérationnelles remises à zéro :', totals);
} finally {
  await db.$disconnect();
}
