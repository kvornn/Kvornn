import crypto from 'node:crypto';
import path from 'node:path';
import express, { Express, NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import type { DatabaseSync } from 'node:sqlite';
import {
  attachAuthMiddleware,
  requireCsrf,
} from './auth';
import {
  ServerSecrets,
  ensureBootstrapAdmins,
  initDatabase,
} from './db';
import { AdminProfile } from '../shared/types';
import { registerAuthRoutes } from './routes/authRoutes';
import { registerUserRoutes } from './routes/userRoutes';
import { registerArchiveRoutes } from './routes/archiveRoutes';
import { registerAdminRoutes } from './routes/adminRoutes';

export interface CreateServerAppOptions {
  dbPath?: string;
  privateStorageDir?: string;
  sessionSecret?: string;
  keyPepper?: string;
  invitePepper?: string;
  loginRateMax?: number;
  bootstrapKeysFilePath?: string;
}

export async function createServerApp(options: CreateServerAppOptions = {}): Promise<{
  app: Express;
  db: DatabaseSync;
  secrets: ServerSecrets;
  bootstrapKeys: Partial<Record<AdminProfile, string>>;
}> {
  const dbPath = options.dbPath || path.resolve(process.cwd(), 'storage', 'sentarika.db');
  const privateStorageDir =
    options.privateStorageDir || path.resolve(process.cwd(), 'storage', 'private_files');

  const sessionSecret =
    options.sessionSecret ||
    process.env.SESSION_SECRET ||
    crypto.createHash('sha256').update(`sentarika-session-${process.cwd()}`).digest('hex');

  const keyPepper =
    options.keyPepper ||
    options.invitePepper ||
    process.env.ACCESS_KEY_PEPPER ||
    process.env.INVITE_PEPPER ||
    crypto.createHash('sha256').update(`sentarika-key-pepper-${sessionSecret}`).digest('hex');

  const secrets: ServerSecrets = { sessionSecret, keyPepper };

  const db = initDatabase(dbPath);
  const bootstrapKeys = await ensureBootstrapAdmins(
    db,
    secrets.keyPepper,
    options.bootstrapKeysFilePath
  );

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(attachAuthMiddleware(db, secrets.sessionSecret));
  app.use('/api', requireCsrf);

  registerAuthRoutes(app, db, secrets, { loginRateMax: options.loginRateMax });
  registerUserRoutes(app, db);
  registerArchiveRoutes(app, db, secrets, privateStorageDir);
  registerAdminRoutes(app, db, secrets, privateStorageDir);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found', code: 'NOT_FOUND' });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });

  return { app, db, secrets, bootstrapKeys };
}
