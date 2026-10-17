
CREATE TYPE "MouvementType" AS ENUM ('ACHAT', 'VENTE');

-- Table des utilisateurs
CREATE TABLE "Utilisateur" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasse" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- Table des carburants
CREATE TABLE "Carburant" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "couleur" TEXT NOT NULL,
    "prixVente" DECIMAL(12,2) NOT NULL,
    "stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "derniereMiseAJour" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Carburant_pkey" PRIMARY KEY ("id")
);

-- Table des achats
CREATE TABLE "Achat" (
    "id" TEXT NOT NULL,
    "carburantId" TEXT NOT NULL,
    "quantite" DECIMAL(14,3) NOT NULL,
    "prixUnitaire" DECIMAL(12,2) NOT NULL,
    "montant" DECIMAL(14,2) NOT NULL,
    "fournisseur" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Achat_pkey" PRIMARY KEY ("id")
);

-- Table des ventes
CREATE TABLE "Vente" (
    "id" TEXT NOT NULL,
    "carburantId" TEXT NOT NULL,
    "quantite" DECIMAL(14,3) NOT NULL,
    "prixUnitaire" DECIMAL(12,2) NOT NULL,
    "montant" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vente_pkey" PRIMARY KEY ("id")
);

-- Table des catégories de dépenses
CREATE TABLE "CategorieDepense" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    CONSTRAINT "CategorieDepense_pkey" PRIMARY KEY ("id")
);

-- Table des dépenses
CREATE TABLE "Depense" (
    "id" TEXT NOT NULL,
    "categorieId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "montant" DECIMAL(14,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Depense_pkey" PRIMARY KEY ("id")
);

-- Table des mouvements de stock
CREATE TABLE "MouvementStock" (
    "id" TEXT NOT NULL,
    "carburantId" TEXT NOT NULL,
    "type" "MouvementType" NOT NULL,
    "quantite" DECIMAL(14,3) NOT NULL,
    "referenceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "creeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MouvementStock_pkey" PRIMARY KEY ("id")
);

-- Table des paramètres
CREATE TABLE "Parametre" (
    "id" TEXT NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'USD',
    CONSTRAINT "Parametre_pkey" PRIMARY KEY ("id")
);

-- Index uniques
CREATE UNIQUE INDEX "Utilisateur_email_key"
ON "Utilisateur"("email");

CREATE UNIQUE INDEX "Carburant_nom_key"
ON "Carburant"("nom");

CREATE UNIQUE INDEX "CategorieDepense_nom_key"
ON "CategorieDepense"("nom");

-- Index de recherche des mouvements de stock
CREATE INDEX "MouvementStock_carburantId_date_idx"
ON "MouvementStock"("carburantId", "date");

-- Relations entre les tables
ALTER TABLE "Achat"
ADD CONSTRAINT "Achat_carburantId_fkey"
FOREIGN KEY ("carburantId")
REFERENCES "Carburant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Vente"
ADD CONSTRAINT "Vente_carburantId_fkey"
FOREIGN KEY ("carburantId")
REFERENCES "Carburant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Depense"
ADD CONSTRAINT "Depense_categorieId_fkey"
FOREIGN KEY ("categorieId")
REFERENCES "CategorieDepense"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MouvementStock"
ADD CONSTRAINT "MouvementStock_carburantId_fkey"
FOREIGN KEY ("carburantId")
REFERENCES "Carburant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
