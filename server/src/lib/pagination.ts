import type { Request } from 'express';
import { ApiError, date } from './http.js';

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalAmountUSD: number;
}

export function paginationFromQuery(query: Request['query']): PaginationParams | null {
  if (query.page === undefined && query.pageSize === undefined) return null;

  const page = query.page === undefined ? 1 : Number(query.page);
  const pageSize = query.pageSize === undefined ? 8 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new ApiError('Le numéro de page doit être un entier positif.', 400);
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new ApiError('La taille de page doit être comprise entre 1 et 100.', 400);
  }

  return { page, pageSize };
}

export function searchFromQuery(query: Request['query']): string | undefined {
  const value = query.recherche;
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length > 120) {
    throw new ApiError('La recherche ne peut pas dépasser 120 caractères.', 400);
  }
  return value.trim() || undefined;
}

export function dateFromQuery(value: unknown, endOfDay = false): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  }
  return date.parse(value);
}

export function paginationResult<T>(
  data: T[],
  total: number,
  totalAmountUSD: number,
  pagination: PaginationParams,
): PaginationResult<T> {
  return {
    data,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.ceil(total / pagination.pageSize),
    totalAmountUSD,
  };
}
