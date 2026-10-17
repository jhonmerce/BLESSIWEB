import { Router, type Response } from 'express';
import type { NextFunction, Request } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { ApiError, asyncRoute } from '../lib/http.js';
import { createAccessToken, createRefreshToken, hashRefreshToken } from '../lib/tokens.js';
import { auth } from '../middleware.js';
import { requireRole, type UserRole } from '../lib/roles.js';

const refreshCookieName = 'station_refresh';
const refreshLifetimeDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/auth',
    maxAge: refreshLifetimeDays * 24 * 60 * 60 * 1000,
  };
}

function getRefreshCookie(cookieHeader?: string): string | undefined {
  const entry = cookieHeader
    ?.split(';')
    .find((part) => part.trim().startsWith(`${refreshCookieName}=`));
  if (!entry) return undefined;
  const value = entry.slice(entry.indexOf('=') + 1).trim();
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie(refreshCookieName, token, refreshCookieOptions());
}

function clearRefreshCookie(res: Response) {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(refreshCookieName, options);
}

function requireTrustedOrigin(req: Request, res: Response, next: NextFunction) {
  const trustedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
  if (req.get('origin') !== trustedOrigin) {
    return res.status(403).json({ error: 'Origine de requête non autorisée.' });
  }
  return next();
}

export function createAuthRouter(db: PrismaClient) {
  const router = Router();
  router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));

  router.post(
    '/login',
    asyncRoute(async (req, res) => {
      const input = z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((value) => value.toLowerCase()),
          password: z.string().min(1).max(256),
        })
        .parse(req.body);
      const user = await db.utilisateur.findUnique({ where: { email: input.email } });
      if (
        !user ||
        !(['ADMIN', 'GERANT'] as string[]).includes(user.role) ||
        !(await bcrypt.compare(input.password, user.motDePasse))
      )
        return res.status(401).json({ error: 'Identifiants incorrects.' });

      const refreshToken = createRefreshToken();
      await db.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashRefreshToken(refreshToken),
          expiresAt: new Date(Date.now() + refreshLifetimeDays * 24 * 60 * 60 * 1000),
        },
      });
      setRefreshCookie(res, refreshToken);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        token: createAccessToken({ id: user.id, email: user.email, role: user.role as UserRole }),
        user: { email: user.email, role: user.role as UserRole },
      });
    }),
  );

  router.post(
    '/refresh',
    requireTrustedOrigin,
    asyncRoute(async (req, res) => {
      const rawToken = getRefreshCookie(req.headers.cookie);
      if (!rawToken) {
        clearRefreshCookie(res);
        return res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
      }

      const tokenHash = hashRefreshToken(rawToken);
      const current = await db.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      const now = new Date();
      if (!current || current.revokedAt || current.expiresAt <= now) {
        if (current && !current.revokedAt)
          await db.refreshToken.update({ where: { id: current.id }, data: { revokedAt: now } });
        clearRefreshCookie(res);
        return res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
      }
      if (!(['ADMIN', 'GERANT'] as string[]).includes(current.user.role)) {
        await db.refreshToken.update({ where: { id: current.id }, data: { revokedAt: now } });
        clearRefreshCookie(res);
        return res.status(401).json({ error: 'Ce compte n’a plus de rôle valide.' });
      }

      const nextRefreshToken = createRefreshToken();
      try {
        await db.$transaction(async (tx) => {
          const rotation = await tx.refreshToken.updateMany({
            where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
            data: { revokedAt: now },
          });
          if (rotation.count !== 1) throw new Error('REFRESH_TOKEN_ALREADY_USED');
          await tx.refreshToken.create({
            data: {
              userId: current.userId,
              tokenHash: hashRefreshToken(nextRefreshToken),
              expiresAt: new Date(Date.now() + refreshLifetimeDays * 24 * 60 * 60 * 1000),
            },
          });
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'REFRESH_TOKEN_ALREADY_USED') {
          clearRefreshCookie(res);
          return res.status(401).json({ error: 'Session déjà renouvelée. Réessayez.' });
        }
        throw error;
      }

      setRefreshCookie(res, nextRefreshToken);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        token: createAccessToken({
          id: current.user.id,
          email: current.user.email,
          role: current.user.role as UserRole,
        }),
        user: { email: current.user.email, role: current.user.role as UserRole },
      });
    }),
  );

  router.post(
    '/logout',
    requireTrustedOrigin,
    asyncRoute(async (req, res) => {
      const rawToken = getRefreshCookie(req.headers.cookie);
      if (rawToken) {
        await db.refreshToken.updateMany({
          where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      clearRefreshCookie(res);
      return res.status(204).end();
    }),
  );

  router.get(
    '/me',
    auth,
    asyncRoute(async (req, res) => res.json({ user: req.user })),
  );

  router.get(
    '/manager-account',
    auth,
    requireRole('ADMIN'),
    asyncRoute(async (_req, res) => {
      const manager = await db.utilisateur.findFirst({
        where: { role: 'GERANT' },
        select: { email: true, creeLe: true },
      });
      return res.json({ exists: Boolean(manager), email: manager?.email || '' });
    }),
  );

  router.put(
    '/manager-account',
    auth,
    requireRole('ADMIN'),
    asyncRoute(async (req, res) => {
      const input = z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((value) => value.toLowerCase()),
          password: z.string().min(12).max(256).optional(),
          adminPassword: z.string().min(1).max(256),
        })
        .parse(req.body);
      const admin = await db.utilisateur.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!(await bcrypt.compare(input.adminPassword, admin.motDePasse))) {
        return res.status(401).json({ error: 'Mot de passe administrateur incorrect.' });
      }
      const motDePasse = input.password ? await bcrypt.hash(input.password, 12) : undefined;
      await db.$transaction(async (tx) => {
        // Serialise la création pour garantir un seul compte gérant si deux admins valident ensemble.
        // Prisma ne peut pas désérialiser le retour PostgreSQL `void` de pg_advisory_xact_lock.
        // Le cast en texte conserve l'exécution du verrou et renvoie un type lisible par Prisma.
        await tx.$queryRaw<{ lock: string }[]>`SELECT pg_advisory_xact_lock(74151620)::text AS lock`;
        const existing = await tx.utilisateur.findFirst({ where: { role: 'GERANT' } });
        if (!existing && !motDePasse) {
          throw new ApiError('Un mot de passe de 12 caractères minimum est requis.', 400);
        }
        if (existing) {
          await tx.utilisateur.update({
            where: { id: existing.id },
            data: { email: input.email, ...(motDePasse ? { motDePasse } : {}) },
          });
          await tx.refreshToken.updateMany({
            where: { userId: existing.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        } else {
          await tx.utilisateur.create({
            data: { email: input.email, motDePasse: motDePasse!, role: 'GERANT' },
          });
        }
      });
      return res.json({ exists: true, email: input.email });
    }),
  );

  router.post(
    '/switch-manager',
    auth,
    requireRole('ADMIN'),
    asyncRoute(async (req, res) => {
      const input = z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((value) => value.toLowerCase()),
          adminPassword: z.string().min(1).max(256),
        })
        .parse(req.body);
      const admin = await db.utilisateur.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!(await bcrypt.compare(input.adminPassword, admin.motDePasse))) {
        return res.status(401).json({ error: 'Mot de passe administrateur incorrect.' });
      }
      const manager = await db.utilisateur.findFirst({
        where: { role: 'GERANT', email: input.email },
        select: { id: true, email: true, role: true },
      });
      if (!manager) return res.status(404).json({ error: 'Compte gérant introuvable.' });

      console.warn(
        JSON.stringify({
          event: 'manager_impersonation_started',
          actor: admin.email,
          account: manager.email,
          at: new Date().toISOString(),
        }),
      );
      return res.json({
        token: createAccessToken(
          {
            id: manager.id,
            email: manager.email,
            role: 'GERANT',
            impersonatedBy: { id: admin.id, email: admin.email },
          },
          '10m',
        ),
        user: { email: manager.email, role: 'GERANT', impersonatedByEmail: admin.email },
        expiresIn: 600,
      });
    }),
  );

  router.patch(
    '/email',
    auth,
    asyncRoute(async (req, res) => {
      if (req.user?.impersonatedBy)
        return res.status(403).json({ error: 'Quittez le mode gérant pour modifier ce compte.' });
      const input = z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((value) => value.toLowerCase()),
          currentPassword: z.string().min(1).max(256),
        })
        .parse(req.body);
      const user = await db.utilisateur.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!(await bcrypt.compare(input.currentPassword, user.motDePasse)))
        return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });

      if (input.email !== user.email) {
        await db.$transaction([
          db.utilisateur.update({ where: { id: user.id }, data: { email: input.email } }),
          db.refreshToken.updateMany({
            where: { userId: user.id, revokedAt: null },
            data: { revokedAt: new Date() },
          }),
        ]);
      }

      clearRefreshCookie(res);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ok: true, email: input.email, sessionRevoked: true });
    }),
  );

  router.patch(
    '/password',
    auth,
    asyncRoute(async (req, res) => {
      if (req.user?.impersonatedBy)
        return res.status(403).json({ error: 'Quittez le mode gérant pour modifier ce compte.' });
      const input = z
        .object({ current: z.string().min(1).max(256), password: z.string().min(12).max(256) })
        .parse(req.body);
      const user = await db.utilisateur.findUniqueOrThrow({ where: { id: req.user!.id } });
      if (!(await bcrypt.compare(input.current, user.motDePasse)))
        return res.status(400).json({ error: 'Mot de passe actuel incorrect.' });
      await db.$transaction([
        db.utilisateur.update({
          where: { id: user.id },
          data: { motDePasse: await bcrypt.hash(input.password, 12) },
        }),
        db.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      clearRefreshCookie(res);
      return res.json({ ok: true, sessionRevoked: true });
    }),
  );

  return router;
}
