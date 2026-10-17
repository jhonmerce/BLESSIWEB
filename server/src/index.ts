import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { auth, errors } from './middleware.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createAuthRouter } from './routes/auth.js';
import { createCarburantsRouter } from './routes/carburants.js';
import { createOperationsRouter } from './routes/operations.js';
import { createSettingsRouter } from './routes/settings.js';
import { createStocksRouter } from './routes/stocks.js';
import { createChauffeursRouter } from './routes/chauffeurs.js';

const app = express();
const jwtSecret = process.env.JWT_SECRET;
const refreshTokenLifetime = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET doit être défini avec au moins 32 caractères.');
}
if (
  !Number.isInteger(refreshTokenLifetime) ||
  refreshTokenLifetime < 1 ||
  refreshTokenLifetime > 365
) {
  throw new Error('REFRESH_TOKEN_TTL_DAYS doit être un entier compris entre 1 et 365.');
}
try {
  const parsedOrigin = new URL(clientOrigin);
  if (
    parsedOrigin.origin !== clientOrigin ||
    !['http:', 'https:'].includes(parsedOrigin.protocol)
  ) {
    throw new Error('invalid origin');
  }
  const isLocalHttpOrigin =
    parsedOrigin.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname);
  if (
    process.env.NODE_ENV === 'production' &&
    parsedOrigin.protocol !== 'https:' &&
    !isLocalHttpOrigin
  ) {
    throw new Error('production requires HTTPS except on localhost');
  }
} catch {
  throw new Error(
    'CLIENT_ORIGIN doit être une origine HTTP(S) exacte; HTTPS est requis en production.',
  );
}

const db = new PrismaClient();
const port = Number(process.env.PORT) || 3000;

app.use(helmet());
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));
app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  }),
);
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', createAuthRouter(db));
app.use('/api', auth);
app.use('/api', createCarburantsRouter(db));
app.use('/api', createOperationsRouter(db));
app.use('/api', createStocksRouter(db));
app.use('/api', createChauffeursRouter(db));
app.use('/api', createAnalyticsRouter(db));
app.use('/api', createSettingsRouter(db));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Route API introuvable.' }));

if (process.env.NODE_ENV === 'production') {
  const clientDirectory = path.resolve(process.cwd(), 'client/dist');
  app.use(express.static(clientDirectory));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDirectory, 'index.html'));
  });
}

app.use(errors);
app.listen(port, () => console.log(`API active sur http://localhost:${port}`));
