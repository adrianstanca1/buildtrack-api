import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import expressRateLimit from 'express-rate-limit';

import { errorHandler } from '../../src/middleware/errorHandler.js';
import { authRouter } from '../../src/routes/auth.js';
import { projectsRouter } from '../../src/routes/projects.js';
import { tasksRouter } from '../../src/routes/tasks.js';
import { workersRouter } from '../../src/routes/workers.js';
import { safetyRouter } from '../../src/routes/safety.js';
import { inspectionsRouter } from '../../src/routes/inspections.js';
import { notificationsRouter } from '../../src/routes/notifications.js';
import { dashboardRouter } from '../../src/routes/dashboard.js';
import { adminRouter } from '../../src/routes/admin.js';
import { uploadsRouter } from '../../src/routes/uploads.js';

export async function createApp() {
  return createTestApp();
}

export function createTestApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Disable rate limiting in tests
  const mockRateLimit = (_req: any, _res: any, next: any) => next();
  app.use('/api/', mockRateLimit);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/workers', workersRouter);
  app.use('/api/safety', safetyRouter);
  app.use('/api/inspections', inspectionsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/uploads', uploadsRouter);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { message: 'Endpoint not found', code: 'NOT_FOUND' },
    });
  });

  app.use(errorHandler);

  return app;
}
