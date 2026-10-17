ALTER TABLE "Vente"
ADD COLUMN "prixAchatReferenceUSD" DECIMAL(16,6) NOT NULL DEFAULT 0,
ADD COLUMN "beneficeUSD" DECIMAL(16,2) NOT NULL DEFAULT 0;

-- Keep driver-account sales on their recorded cost basis, and initialize all rows.
UPDATE "Vente"
SET "prixAchatReferenceUSD" = "coutUnitaireUSD",
    "beneficeUSD" = ROUND("montantUSD" - "coutTotalUSD", 2);

-- Recalculate direct-sale profit from the latest fuel purchase on or before the sale date.
WITH sale_purchase_cost AS (
  SELECT
    v."id",
    p."montantUSD" / NULLIF(p."quantite", 0) AS "unitCostUSD"
  FROM "Vente" v
  JOIN LATERAL (
    SELECT a."montantUSD", a."quantite"
    FROM "Achat" a
    WHERE a."carburantId" = v."carburantId"
      AND a."date" <= v."date"
      AND a."montantUSD" > 0
      AND a."quantite" > 0
    ORDER BY a."date" DESC, a."creeLe" DESC
    LIMIT 1
  ) p ON TRUE
  WHERE v."chauffeurId" IS NULL
)
UPDATE "Vente" v
SET "prixAchatReferenceUSD" = c."unitCostUSD",
    "beneficeUSD" = ROUND(v."montantUSD" - v."quantite" * c."unitCostUSD", 2)
FROM sale_purchase_cost c
WHERE v."id" = c."id";
