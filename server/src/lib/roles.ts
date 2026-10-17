import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middleware.js';

export const userRoles = ['ADMIN', 'GERANT'] as const;
export type UserRole = (typeof userRoles)[number];

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Vous n’avez pas les droits pour cette action.' });
    }
    return next();
  };
}
