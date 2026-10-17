ALTER TABLE "Vente"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestHash" TEXT;

CREATE UNIQUE INDEX "Vente_idempotencyKey_key" ON "Vente"("idempotencyKey");

ALTER TABLE "Depense"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestHash" TEXT;

CREATE UNIQUE INDEX "Depense_idempotencyKey_key" ON "Depense"("idempotencyKey");

ALTER TABLE "MouvementCompte"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestHash" TEXT,
ADD COLUMN "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "MouvementCompte_idempotencyKey_key" ON "MouvementCompte"("idempotencyKey");
