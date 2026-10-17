import { ApiError } from './lib/http.js';

export function total(quantity: number, unitPrice: number): number {
  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(unitPrice) ||
    quantity <= 0 ||
    unitPrice <= 0
  ) {
    throw new ApiError('La quantité et le prix doivent être strictement positifs.');
  }

  return Math.round((quantity * unitPrice + Number.EPSILON) * 100) / 100;
}

export function profitFromUnitPrices(
  saleUnitPriceUSD: number,
  purchaseUnitPriceUSD: number,
  quantity: number,
): number {
  if (
    ![saleUnitPriceUSD, purchaseUnitPriceUSD, quantity].every(Number.isFinite) ||
    saleUnitPriceUSD < 0 ||
    purchaseUnitPriceUSD < 0 ||
    quantity <= 0
  ) {
    throw new ApiError('Les prix unitaires et la quantité doivent être valides.');
  }

  const rawProfit = (saleUnitPriceUSD - purchaseUnitPriceUSD) * quantity;
  return Math.round((rawProfit + Number.EPSILON) * 100) / 100;
}

export function nextStock(current: number, quantity: number, operation: 'ACHAT' | 'VENTE'): number {
  if (!Number.isFinite(current) || current < 0 || !Number.isFinite(quantity) || quantity <= 0) {
    throw new ApiError('Le stock et la quantité doivent être valides et positifs.');
  }

  if (operation === 'VENTE' && quantity > current) {
    throw new ApiError('Stock insuffisant.', 409);
  }

  const change = operation === 'ACHAT' ? quantity : -quantity;
  return Math.round((current + change + Number.EPSILON) * 1000) / 1000;
}

export function nextDriverFuelBalance(
  current: number,
  quantity: number,
  operation: 'APPROVISIONNEMENT' | 'VENTE',
): number {
  if (!Number.isFinite(current) || current < 0 || !Number.isFinite(quantity) || quantity <= 0) {
    throw new ApiError('Le solde et la quantité doivent être valides et positifs.');
  }

  if (operation === 'VENTE' && quantity > current) {
    throw new ApiError('Solde chauffeur insuffisant en litres.', 409);
  }

  const change = operation === 'APPROVISIONNEMENT' ? quantity : -quantity;
  return Math.round((current + change + Number.EPSILON) * 1000) / 1000;
}

export function weightedAveragePrice(
  currentQuantity: number,
  currentPrice: number,
  addedQuantity: number,
  addedPrice: number,
): number {
  if (
    ![currentQuantity, currentPrice, addedQuantity, addedPrice].every(Number.isFinite) ||
    currentQuantity < 0 ||
    currentPrice < 0 ||
    addedQuantity <= 0 ||
    addedPrice <= 0
  ) {
    throw new ApiError('Les quantités et prix doivent être valides et positifs.');
  }

  return (
    (currentQuantity * currentPrice + addedQuantity * addedPrice) /
    (currentQuantity + addedQuantity)
  );
}

export function stockStatus(quantity: number): 'critique' | 'faible' | 'normal' {
  return quantity < 50 ? 'critique' : quantity < 100 ? 'faible' : 'normal';
}
