import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware.js';

export const positive = z.number().finite().positive();
export const date = z.coerce.date();

/** Normalise les textes saisis et refuse les caractères de contrôle invisibles. */
export const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `Le texte doit contenir au moins ${min} caractère(s).`)
    .max(max, `Le texte ne peut pas dépasser ${max} caractères.`)
    .refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value), {
      message: 'Le texte contient des caractères non autorisés.',
    });

export const optionalText = (max: number) =>
  z.union([z.literal('').transform(() => undefined), text(1, max)]).optional();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const asyncRoute =
  (handler: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
