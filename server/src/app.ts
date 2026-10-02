import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { DB } from './db.js';
import { config } from './config.js';
import { AppError } from './errors.js';
import { logSystemError } from './helpers.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { eventsRouter } from './routes/events.js';
import { travelRouter } from './routes/travel.js';
import { expensesRouter } from './routes/expenses.js';
import { settlementsRouter } from './routes/settlements.js';
import { adminRouter } from './routes/admin.js';
import { uploadsRouter, notificationsRouter, problemsRouter } from './routes/misc.js';

export function createApp(db: DB) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins, allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() })); // public, no data

  app.use('/api/auth', authRouter(db));
  app.use('/api/users', usersRouter(db));
  app.use('/api/events', eventsRouter(db));
  app.use('/api/attachments', uploadsRouter(db));
  app.use('/api/notifications', notificationsRouter(db));
  // routers that declare full sub-paths
  app.use('/api', travelRouter(db));
  app.use('/api', expensesRouter(db));
  app.use('/api', settlementsRouter(db));
  app.use('/api', problemsRouter(db));
  app.use('/api', adminRouter(db));

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Route not found', 'NOT_FOUND')));

  // Central error handler: friendly JSON for expected errors, generic 500 + system_errors row otherwise.
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Malformed JSON body' } });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request too large' } });
    if (err?.name === 'MulterError') return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: 'Upload failed' } });
    logSystemError(db, /SQLITE/.test(err?.code ?? '') ? 'database' : 'api', err, { method: req.method, path: req.path }, (req as any).user?.id);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. The problem has been logged.' } });
  });
  return app;
}
