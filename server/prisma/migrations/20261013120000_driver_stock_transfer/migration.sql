ALTER TYPE "MouvementType" ADD VALUE 'APPROVISIONNEMENT_CHAUFFEUR';
ALTER TABLE "SoldeChauffeurCarburant" ADD COLUMN "coutMoyenUSD" DECIMAL(16,6) NOT NULL DEFAULT 0;
ALTER TABLE "MouvementStock" ADD COLUMN "chauffeurId" TEXT;
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "MouvementStock_chauffeurId_idx" ON "MouvementStock"("chauffeurId");