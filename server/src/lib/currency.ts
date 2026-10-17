import type { Prisma } from '@prisma/client';
import { ApiError } from './http.js';

export class DailyRateRequiredError extends ApiError {
  constructor(date: Date, currency: string) {
    super(
      `No USD/${currency} exchange rate is configured for ${date.toISOString().slice(0, 10)}.`,
      409,
    );
    this.name = 'DailyRateRequiredError';
  }
}

export function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export async function conversionForDate(
  tx: Prisma.TransactionClient,
  date: Date,
  sourceCurrency: string,
): Promise<{ rate: number; targetCurrency: string }> {
  if (sourceCurrency !== 'USD' && sourceCurrency !== 'CDF')
    throw new Error('Operation currency must be USD or CDF.');

  const operationDay = dateOnly(date);
  const saved = await tx.tauxJournalier.findUnique({
    where: {
      date_deviseSource_deviseCible: {
        date: operationDay,
        deviseSource: 'USD',
        deviseCible: 'CDF',
      },
    },
  });
  if (!saved) throw new DailyRateRequiredError(operationDay, 'CDF');
  const dailyRate = Number(saved.taux);
  return sourceCurrency === 'USD'
    ? { rate: dailyRate, targetCurrency: 'CDF' }
    : { rate: 1 / dailyRate, targetCurrency: 'USD' };
}

export function convertedAmount(amount: number, rate: number): number {
  return Math.round((amount * rate + Number.EPSILON) * 100) / 100;
}

export function amountInUSD(amount: number, sourceCurrency: string, rate: number): number {
  return sourceCurrency === 'USD' ? convertedAmount(amount, 1) : convertedAmount(amount, rate);
}
