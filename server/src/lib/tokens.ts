import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { UserRole } from './roles.js';

export function createRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createAccessToken(
  user: {
    id: string;
    email: string;
    role: UserRole;
    impersonatedBy?: { id: string; email: string };
  },
  expiresIn?: jwt.SignOptions['expiresIn'],
): string {
  return jwt.sign(user, process.env.JWT_SECRET!, {
    algorithm: 'HS256',
    expiresIn: expiresIn || ((process.env.JWT_EXPIRES_IN || '15m') as jwt.SignOptions['expiresIn']),
  });
}
