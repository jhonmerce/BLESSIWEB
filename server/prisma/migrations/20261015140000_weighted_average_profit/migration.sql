-- Keep each sale's stored weighted-average cost as its historical cost basis.
-- coutUnitaireUSD is captured when the sale is created (station or driver account).
UPDATE "Vente"
SET "prixAchatReferenceUSD" = "coutUnitaireUSD",
    "beneficeUSD" = ROUND("montantUSD" - "coutTotalUSD", 2);
