CREATE TYPE "MouvementCompteType" AS ENUM ('APPROVISIONNEMENT', 'VENTE', 'ANNULATION');

CREATE TABLE "Entreprise" (
  "id" TEXT NOT NULL,
  "nom" TEXT NOT NULL,
  "telephone" TEXT,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Entreprise_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Entreprise_nom_key" ON "Entreprise"("nom");

CREATE TABLE "Chauffeur" (
  "id" TEXT NOT NULL,
  "entrepriseId" TEXT NOT NULL,
  "nom" TEXT NOT NULL,
  "telephone" TEXT NOT NULL,
  "plaque" TEXT NOT NULL,
  "marque" TEXT NOT NULL,
  "soldeUSD" DECIMAL(16,2) NOT NULL DEFAULT 0,
  "soldeCDF" DECIMAL(16,2) NOT NULL DEFAULT 0,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "misAJourLe" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Chauffeur_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Chauffeur_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "Entreprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Chauffeur_entrepriseId_plaque_key" ON "Chauffeur"("entrepriseId", "plaque");
CREATE INDEX "Chauffeur_entrepriseId_nom_idx" ON "Chauffeur"("entrepriseId", "nom");

CREATE TABLE "MouvementCompte" (
  "id" TEXT NOT NULL,
  "chauffeurId" TEXT NOT NULL,
  "type" "MouvementCompteType" NOT NULL,
  "montant" DECIMAL(16,2) NOT NULL,
  "devise" TEXT NOT NULL,
  "variationUSD" DECIMAL(16,2) NOT NULL,
  "variationCDF" DECIMAL(16,2) NOT NULL,
  "soldeUSD" DECIMAL(16,2) NOT NULL,
  "soldeCDF" DECIMAL(16,2) NOT NULL,
  "tauxUtilise" DECIMAL(16,6) NOT NULL,
  "description" TEXT,
  "referenceVente" TEXT,
  "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MouvementCompte_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MouvementCompte_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MouvementCompte_referenceVente_key" ON "MouvementCompte"("referenceVente");
CREATE INDEX "MouvementCompte_chauffeurId_creeLe_idx" ON "MouvementCompte"("chauffeurId", "creeLe");

ALTER TABLE "Vente" ADD COLUMN "chauffeurId" TEXT;
ALTER TABLE "Vente" ADD COLUMN "debitUSD" DECIMAL(16,2) NOT NULL DEFAULT 0;
ALTER TABLE "Vente" ADD COLUMN "debitCDF" DECIMAL(16,2) NOT NULL DEFAULT 0;
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "Chauffeur"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Vente_chauffeurId_idx" ON "Vente"("chauffeurId");