/**
 * Express app factory. Kept separate from the server bootstrap (index.ts) so
 * supertest can mount the app without binding a port.
 */
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env';
import { logger } from './shared/logger';
import { errorHandler } from './shared/middleware/errorHandler';
import { notFound } from './shared/middleware/notFound';
import { authRouter } from './auth/auth.routes';
import { keyVaultRouter } from './keyvault/keyVault.routes';
import { spotsRouter } from './spots/spots.routes';
import { groupRouter } from './group/group.routes';
import { locationRouter } from './location/location.routes';
import { notificationRouter } from './notification/notification.routes';

export function createApp(): Express {
  const app = express();

  // Security headers + body parsing.
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (!config.isTest) {
    app.use(morgan('combined'));
  }

  // Health check (no auth).
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
  });

  // Feature routers.
  app.use('/auth', authRouter);
  app.use('/me/keys', keyVaultRouter);
  app.use('/spots', spotsRouter);
  app.use('/groups', groupRouter);
  app.use('/location', locationRouter);
  app.use('/notifications', notificationRouter);

  // 404 + error handler (last).
  app.use(notFound);
  app.use(errorHandler);

  logger.info('Express app created');
  return app;
}