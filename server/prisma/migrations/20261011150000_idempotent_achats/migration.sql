ALTER TABLE "Achat"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "requestHash" TEXT;

CREATE UNIQUE INDEX "Achat_idempotencyKey_key"
ON "Achat"("idempotencyKey");
