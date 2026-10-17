import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  amountInUSD,
  conversionForDate,
  convertedAmount,
  dateOnly,
  DailyRateRequiredError,
} from './lib/currency.js';

describe('daily currency conversion', () => {
  it('converts an amount and rounds to two decimal places', () => {
    expect(convertedAmount(12.34, 2850.5)).toBe(35175.17);
  });

  it('normalizes a date to UTC midnight', () => {
    expect(dateOnly(new Date('2026-10-11T17:42:00.000Z')).toISOString()).toBe(
      '2026-10-11T00:00:00.000Z',
    );
  });

  it('uses the daily USD to CDF rate for an operation entered in USD', async () => {
    const findUnique = vi.fn().mockResolvedValue({ taux: 2850.5 });
    const tx = { tauxJournalier: { findUnique } } as unknown as Prisma.TransactionClient;
    await expect(conversionForDate(tx, new Date('2026-10-11T00:00:00.000Z'), 'USD')).resolves.toEqual({
      rate: 2850.5,
      targetCurrency: 'CDF',
    });
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it('inverts the daily rate for an operation entered in CDF', async () => {
    const tx = {
      tauxJournalier: { findUnique: vi.fn().mockResolvedValue({ taux: 2850.5 }) },
    } as unknown as Prisma.TransactionClient;
    const result = await conversionForDate(tx, new Date('2026-10-11T00:00:00.000Z'), 'CDF');
    expect(result.targetCurrency).toBe('USD');
    expect(result.rate).toBeCloseTo(1 / 2850.5);
    expect(amountInUSD(10000, 'CDF', result.rate)).toBe(3.51);
  });

  it('rejects a conversion when no rate exists for that day', async () => {
    const tx = {
      tauxJournalier: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as Prisma.TransactionClient;
    await expect(conversionForDate(tx, new Date('2026-10-11T00:00:00.000Z'), 'USD')).rejects.toBeInstanceOf(
      DailyRateRequiredError,
    );
  });
});
