CREATE TABLE "JournalModification" (
    "id" TEXT NOT NULL,
    "entite" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "acteurId" TEXT NOT NULL,
    "acteurEmail" TEXT NOT NULL,
    "avant" JSONB NOT NULL,
    "apres" JSONB NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalModification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JournalModification_creeLe_idx" ON "JournalModification"("creeLe");
CREATE INDEX "JournalModification_entite_entiteId_idx" ON "JournalModification"("entite", "entiteId");
CREATE INDEX "JournalModification_acteurId_creeLe_idx" ON "JournalModification"("acteurId", "creeLe");
