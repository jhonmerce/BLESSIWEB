ALTER TABLE "Achat"
ADD COLUMN "montantUSD" DECIMAL(16,2) NOT NULL DEFAULT 0;
UPDATE "Achat" SET "montantUSD" = "montant";

ALTER TABLE "Vente"
ADD COLUMN "montantUSD" DECIMAL(16,2) NOT NULL DEFAULT 0;
UPDATE "Vente" SET "montantUSD" = "montant";

ALTER TABLE "Depense"
ADD COLUMN "montantUSD" DECIMAL(16,2) NOT NULL DEFAULT 0;
UPDATE "Depense" SET "montantUSD" = "montant";
