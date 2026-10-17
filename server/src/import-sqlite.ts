import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { profitFromUnitPrices, weightedAveragePrice } from './domain.js';
type Row = Record<string, any>;
const db = new PrismaClient();
const root = resolve(process.cwd(), '..');
const file = resolve(process.argv[2] || 'carburant.db');
const tables = JSON.parse(
  execFileSync(process.env.PYTHON || 'python', ['server/scripts/import-sqlite.py', file], {
    cwd: root,
    encoding: 'utf8',
  }),
) as Record<string, Row[]>;
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
const get = (r: Row, ...names: string[]) => {
  for (const n of names) {
    const k = Object.keys(r).find((x) => norm(x) === norm(n));
    if (k !== undefined) return r[k];
  }
  return undefined;
};
const rows = (...names: string[]) =>
  Object.entries(tables).find(([t]) => names.some((n) => norm(t) === norm(n)))?.[1] || [];
const idMap = new Map<string, string>();
async function main() {
  if (!Object.keys(tables).length) throw Error('Aucune table trouvÃ©e dans la base SQLite.');
  await db.$transaction(async (tx) => {
    for (const [i, r] of rows('carburants', 'carburant', 'fuel', 'fuels').entries()) {
      const name = String(get(r, 'nom', 'name', 'type') || `Carburant ${i + 1}`);
      const c = await tx.carburant.upsert({
        where: { nom: name },
        update: {},
        create: {
          nom: name,
          couleur: String(
            get(r, 'couleur', 'color') || ['#4169e1', '#9168e8', '#f3a522', '#12a87c'][i % 4],
          ),
          prixVente: Number(get(r, 'prixVente', 'prix_vente', 'prix', 'sale_price') || 1),
          stock: 0,
        },
      });
      idMap.set(String(get(r, 'id', 'carburant_id') ?? name), c.id);
    }
    const operations = [
      ...rows('achats', 'achat').map((row) => ({ row, kind: 'ACHAT' as const })),
      ...rows('ventes', 'vente').map((row) => ({ row, kind: 'VENTE' as const })),
    ]
      .map((operation) => ({
        ...operation,
        when: new Date(
          String(get(operation.row, 'date', 'created_at', 'createdAt') || new Date().toISOString()),
        ),
      }))
      .sort((a, b) => a.when.getTime() - b.when.getTime());

    for (const { row: r, kind, when } of operations) {
      const old = String(get(r, 'carburantId', 'carburant_id', 'fuel_id', 'idCarburant') ?? '');
      let fuelId = idMap.get(old);
      if (!fuelId) {
        const name = String(get(r, 'carburant', 'fuel', 'type') || 'Carburant importÃ©');
        const f = await tx.carburant.upsert({
          where: { nom: name },
          update: {},
          create: {
            nom: name,
            couleur: '#4169e1',
            prixVente: Number(get(r, 'prixVente', 'prix_vente', 'prix') || 0),
            stock: 0,
          },
        });
        fuelId = f.id;
        idMap.set(old, f.id);
      }
      const quantity = Number(get(r, 'quantite', 'quantity', 'litres', 'volume') || 0),
        price = Number(get(r, 'prixUnitaire', 'prix_unitaire', 'prix', 'price') || 0);
      if (quantity <= 0 || price <= 0) continue;
      const amount = Math.round(quantity * price * 100) / 100;
      const reference = String(get(r, 'id') || `${kind}-${Date.now()}-${Math.random()}`);
      if (kind === 'ACHAT') {
        await tx.achat.create({
          data: {
            carburantId: fuelId,
            quantite: quantity,
            prixUnitaire: price,
            montant: amount,
            devise: 'USD',
            montantConverti: amount,
            deviseConvertie: 'USD',
            tauxUtilise: 1,
            montantUSD: amount,
            fournisseur: String(get(r, 'fournisseur', 'supplier') || 'Import SQLite'),
            date: when,
          },
        });
        const fuel = await tx.carburant.findUniqueOrThrow({ where: { id: fuelId } });
        const oldQuantity = Number(fuel.stock);
        const newQuantity = oldQuantity + quantity;
        const newAverageCost = weightedAveragePrice(
          oldQuantity,
          Number(fuel.coutMoyenUSD),
          quantity,
          amount / quantity,
        );
        await tx.carburant.update({
          where: { id: fuelId },
          data: { stock: newQuantity, coutMoyenUSD: newAverageCost },
        });
      } else {
        const fuel = await tx.carburant.findUniqueOrThrow({ where: { id: fuelId } });
        if (quantity > Number(fuel.stock)) {
          throw new Error(
            `Import interrompu : la vente du ${when.toLocaleDateString('fr-FR')} demande ${quantity} L, mais le stock disponible est de ${Number(fuel.stock)} L (${fuel.nom}).`,
          );
        }
        const unitCost = Number(fuel.coutMoyenUSD);
        if (unitCost <= 0) {
          throw new Error(
            `Import interrompu : aucun coût d'achat connu pour la vente du ${when.toLocaleDateString('fr-FR')} (${fuel.nom}).`,
          );
        }
        const amountUSD = amount;
        await tx.vente.create({
          data: {
            carburantId: fuelId,
            quantite: quantity,
            prixUnitaire: price,
            montant: amount,
            devise: 'USD',
            montantConverti: amount,
            deviseConvertie: 'USD',
            tauxUtilise: 1,
            montantUSD: amountUSD,
            coutUnitaireUSD: unitCost,
            coutTotalUSD: Math.round(quantity * unitCost * 100) / 100,
            prixAchatReferenceUSD: unitCost,
            beneficeUSD: profitFromUnitPrices(amountUSD / quantity, unitCost, quantity),
            date: when,
          },
        });
        await tx.carburant.update({
          where: { id: fuelId },
          data: { stock: { decrement: quantity } },
        });
      }
      await tx.mouvementStock.create({
        data: {
          carburantId: fuelId,
          type: kind,
          quantite: quantity,
          referenceId: reference,
          date: when,
        },
      });
    }
    for (const r of rows(
      'categoriesDepenses',
      'categories_depenses',
      'categories',
      'expense_categories',
    )) {
      const name = String(get(r, 'nom', 'name', 'categorie') || '').trim();
      if (name)
        await tx.categorieDepense.upsert({
          where: { nom: name },
          update: {},
          create: { nom: name },
        });
    }
    for (const r of rows('depenses', 'depense', 'expenses', 'expense')) {
      const name = String(get(r, 'categorie', 'category') || 'Autres');
      const category = await tx.categorieDepense.upsert({
        where: { nom: name },
        update: {},
        create: { nom: name },
      });
      const amount = Number(get(r, 'montant', 'amount', 'prix') || 0);
      if (amount <= 0) continue;
      await tx.depense.create({
        data: {
          categorieId: category.id,
          description: String(get(r, 'description', 'libelle', 'motif') || 'Import SQLite'),
          montant: amount,
          devise: 'USD',
          montantConverti: amount,
          deviseConvertie: 'USD',
          tauxUtilise: 1,
          date: new Date(
            String(get(r, 'date', 'created_at', 'createdAt') || new Date().toISOString()),
          ),
        },
      });
    }
  });
  console.log(
    'Import SQLite terminÃ©. Les lignes invalides (quantitÃ©s/prix non positifs) ont Ã©tÃ© ignorÃ©es.',
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
