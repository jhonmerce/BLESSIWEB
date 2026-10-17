ALTER TABLE "Vente" ADD COLUMN "debitLitres" DECIMAL(14,3) NOT NULL DEFAULT 0;

CREATE TABLE "SoldeChauffeurCarburant" (
  "id" TEXT NOT NULL,
  "chauffeurId" TEXT NOT NULL,
  "carburantId" TEXT NOT NULL,
  "quantite" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "misAJourLe" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SoldeChauffeurCarburant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SoldeChauffeurCarburant_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SoldeChauffeurCarburant_carburantId_fkey" FOREIGN KEY ("carburantId") REFERENCES "Carburant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SoldeChauffeurCarburant_chauffeurId_carburantId_key" ON "SoldeChauffeurCarburant"("chauffeurId", "carburantId");
CREATE INDEX "SoldeChauffeurCarburant_carburantId_idx" ON "SoldeChauffeurCarburant"("carburantId");

ALTER TABLE "MouvementCompte" ADD COLUMN "carburantId" TEXT;
ALTER TABLE "MouvementCompte" ADD COLUMN "quantite" DECIMAL(14,3);
ALTER TABLE "MouvementCompte" ADD COLUMN "variationLitres" DECIMAL(14,3);
ALTER TABLE "MouvementCompte" ADD COLUMN "soldeLitres" DECIMAL(14,3);
ALTER TABLE "MouvementCompte" ADD CONSTRAINT "MouvementCompte_carburantId_fkey" FOREIGN KEY ("carburantId") REFERENCES "Carburant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;