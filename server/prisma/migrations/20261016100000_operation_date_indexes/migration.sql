CREATE INDEX "Achat_date_id_idx" ON "Achat"("date", "id");
CREATE INDEX "Achat_carburantId_date_idx" ON "Achat"("carburantId", "date");

CREATE INDEX "Vente_date_id_idx" ON "Vente"("date", "id");
CREATE INDEX "Vente_carburantId_date_idx" ON "Vente"("carburantId", "date");

CREATE INDEX "Depense_date_id_idx" ON "Depense"("date", "id");
CREATE INDEX "Depense_categorieId_date_idx" ON "Depense"("categorieId", "date");
