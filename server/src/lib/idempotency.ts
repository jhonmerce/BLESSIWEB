import { createHash } from 'node:crypto';
import { z } from 'zod';

export function idempotencyKey(header: string | undefined): string {
  return z.string().uuid().parse(header);
}

export function requestHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
