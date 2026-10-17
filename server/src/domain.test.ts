import { describe, it, expect } from 'vitest';
import {
  nextDriverFuelBalance,
  nextStock,
  total,
  profitFromUnitPrices,
  stockStatus,
  weightedAveragePrice,
} from './domain.js';
describe('règles de stock et calculs financiers', () => {
  it('calcule le montant avec deux décimales', () => expect(total(12.5, 1.6)).toBe(20));
  it('rejette quantités et prix nuls', () => {
    expect(() => total(0, 1)).toThrow();
    expect(() => total(1, 0)).toThrow();
  });
  it('ajoute un achat au stock et retire une vente', () => {
    expect(nextStock(25, 10, 'ACHAT')).toBe(35);
    expect(nextStock(25, 10, 'VENTE')).toBe(15);
  });
  it('bloque une vente supérieure au stock', () =>
    expect(() => nextStock(5, 6, 'VENTE')).toThrow(/insuffisant/));
  it('transfÃ¨re les litres vers le compte chauffeur puis dÃ©bite ce compte', () => {
    const solde = nextDriverFuelBalance(0, 80, 'APPROVISIONNEMENT');
    expect(solde).toBe(80);
    expect(nextDriverFuelBalance(solde, 25, 'VENTE')).toBe(55);
  });
  it('refuse une vente supÃ©rieure au solde carburant du chauffeur', () => {
    expect(() => nextDriverFuelBalance(10, 11, 'VENTE')).toThrow(/insuffisant/);
  });
  it('calcule le prix moyen prÃ©payÃ© pondÃ©rÃ© entre plusieurs approvisionnements', () => {
    expect(weightedAveragePrice(10, 2, 30, 4)).toBe(3.5);
  });
  it('calculates weighted stock cost and gross profit after a new purchase', () => {
    const averageCost = weightedAveragePrice(20, 1.8, 30, 1.7);
    expect(averageCost).toBeCloseTo(1.74);
    expect(profitFromUnitPrices(1.9, averageCost, 15)).toBe(2.4);
  });
  it('calcule le bénéfice unitaire du carburant vendu', () => {
    expect(profitFromUnitPrices(1.9, 1.4, 150)).toBe(75);
  });
  it('classe les alertes', () => {
    expect(stockStatus(20)).toBe('critique');
    expect(stockStatus(60)).toBe('faible');
    expect(stockStatus(120)).toBe('normal');
  });
});
