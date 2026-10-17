import { describe, expect, it } from 'vitest';
import { createRefreshToken, hashRefreshToken } from './tokens.js';

describe('refresh token helpers', () => {
  it('creates high entropy URL-safe tokens and stores a one-way hash', () => {
    const first = createRefreshToken();
    const second = createRefreshToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(second).not.toBe(first);
    expect(hashRefreshToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRefreshToken(first)).not.toBe(first);
    expect(hashRefreshToken(first)).toBe(hashRefreshToken(first));
  });
});
