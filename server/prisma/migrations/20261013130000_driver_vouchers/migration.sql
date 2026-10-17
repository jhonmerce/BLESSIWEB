ALTER TABLE "SoldeChauffeurCarburant"
ADD COLUMN "prixMoyenPrepayUSD" DECIMAL(16,6) NOT NULL DEFAULT 0;

ALTER TABLE "Vente"
ADD COLUMN "soldeChauffeurApres" DECIMAL(14,3);
