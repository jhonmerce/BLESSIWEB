import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { userRoles, type UserRole } from './lib/roles.js';
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    impersonatedBy?: { id: string; email: string };
  };
}
export function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Authentification requise.' });
  try {
    const payload = jwt.verify(h.slice(7), process.env.JWT_SECRET!, {
      algorithms: ['HS256'],
    });
    if (
      typeof payload !== 'object' ||
      typeof payload.id !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.role !== 'string' ||
      !userRoles.includes(payload.role as UserRole)
    ) {
      return res.status(401).json({ error: 'Session invalide ou expirée.' });
    }
    const impersonatedBy =
      typeof payload.impersonatedBy === 'object' &&
      payload.impersonatedBy !== null &&
      typeof payload.impersonatedBy.id === 'string' &&
      typeof payload.impersonatedBy.email === 'string'
        ? { id: payload.impersonatedBy.id, email: payload.impersonatedBy.email }
        : undefined;
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role as UserRole,
      impersonatedBy,
    };
    if (impersonatedBy && req.method !== 'GET') {
      console.warn(
        JSON.stringify({
          event: 'manager_impersonation_action',
          actor: impersonatedBy.email,
          account: payload.email,
          method: req.method,
          path: req.originalUrl,
          at: new Date().toISOString(),
        }),
      );
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
}
export function errors(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (process.env.NODE_ENV === 'production') {
    const known = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
    console.error({ name: err instanceof Error ? err.name : 'UnknownError', code: known });
  } else {
    console.error(err);
  }
  if (res.headersSent) return;

  if (err instanceof ZodError)
    return res.status(400).json({
      error: 'Données invalides.',
      details: err.issues.slice(0, 10).map(({ path, message }) => ({ path, message })),
    });

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Cette donnée existe déjà.' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Élément introuvable.' });
    if (err.code === 'P2003')
      return res.status(409).json({ error: 'Cette opération est liée à d’autres données.' });
  }

  const candidate = err as { name?: unknown; status?: unknown; message?: unknown };
  const status =
    typeof candidate?.status === 'number' && candidate.status >= 400 && candidate.status < 500
      ? candidate.status
      : 500;
  const publicMessage =
    status < 500 && candidate.name === 'ApiError' && typeof candidate.message === 'string'
      ? candidate.message
      : status < 500
        ? 'Requête invalide.'
        : 'Une erreur serveur est survenue.';
  return res.status(status).json({ error: publicMessage });
}
