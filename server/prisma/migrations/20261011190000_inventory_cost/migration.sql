ALTER TABLE "Carburant" ADD COLUMN "coutMoyenUSD" DECIMAL(16,6) NOT NULL DEFAULT 0;
ALTER TABLE "Vente" ADD COLUMN "coutUnitaireUSD" DECIMAL(16,6) NOT NULL DEFAULT 0;
ALTER TABLE "Vente" ADD COLUMN "coutTotalUSD" DECIMAL(16,2) NOT NULL DEFAULT 0;

-- Existing sales did not retain acquisition cost. Rebuild their cost using each
-- fuel's weighted average of recorded purchases as the best available estimate.
WITH "CoutsMoyens" AS (
  SELECT "carburantId", SUM("montantUSD") / NULLIF(SUM("quantite"), 0) AS cout
  FROM "Achat"
  GROUP BY "carburantId"
)
UPDATE "Carburant" AS c
SET "coutMoyenUSD" = COALESCE(cm.cout, 0)
FROM "CoutsMoyens" AS cm
WHERE c.id = cm."carburantId";

UPDATE "Vente" AS v
SET "coutUnitaireUSD" = c."coutMoyenUSD",
    "coutTotalUSD" = ROUND(v."quantite" * c."coutMoyenUSD", 2)
FROM "Carburant" AS c
WHERE c.id = v."carburantId";
