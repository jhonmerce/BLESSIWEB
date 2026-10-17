ALTER TABLE "Achat"
ADD COLUMN "devise" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "montantConverti" DECIMAL(16,2) NOT NULL DEFAULT 0,
ADD COLUMN "deviseConvertie" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "tauxUtilise" DECIMAL(16,6) NOT NULL DEFAULT 1;

UPDATE "Achat" SET "montantConverti" = "montant";

ALTER TABLE "Vente"
ADD COLUMN "devise" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "montantConverti" DECIMAL(16,2) NOT NULL DEFAULT 0,
ADD COLUMN "deviseConvertie" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "tauxUtilise" DECIMAL(16,6) NOT NULL DEFAULT 1;

UPDATE "Vente" SET "montantConverti" = "montant";

ALTER TABLE "Depense"
ADD COLUMN "devise" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "montantConverti" DECIMAL(16,2) NOT NULL DEFAULT 0,
ADD COLUMN "deviseConvertie" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "tauxUtilise" DECIMAL(16,6) NOT NULL DEFAULT 1;

UPDATE "Depense" SET "montantConverti" = "montant";

CREATE TABLE "TauxJournalier" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "deviseSource" TEXT NOT NULL DEFAULT 'USD',
    "deviseCible" TEXT NOT NULL,
    "taux" DECIMAL(16,6) NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "misAJourLe" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TauxJournalier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TauxJournalier_date_deviseSource_deviseCible_key"
ON "TauxJournalier"("date", "deviseSource", "deviseCible");

CREATE INDEX "TauxJournalier_date_idx" ON "TauxJournalier"("date");
