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
import { defectsRouter } from '../../src/routes/defects.js';
import { permitsRouter } from '../../src/routes/permits.js';
import { timesheetsRouter } from '../../src/routes/timesheets.js';
import { dailyReportsRouter } from '../../src/routes/daily_reports.js';
import { teamMembersRouter } from '../../src/routes/team_members.js';
import { rfisRouter } from '../../src/routes/rfis.js';
import { drawingsRouter } from '../../src/routes/drawings.js';
import { invoicesRouter } from '../../src/routes/invoices.js';
import { submittalsRouter } from '../../src/routes/submittals.js';
import { riskDashboardRouter } from '../../src/routes/risk_dashboard.js';
import { projectTimelineRouter } from '../../src/routes/project_timeline.js';
import { linksRouter } from '../../src/routes/links.js';
import { guestsRouter } from '../../src/routes/guests.js';
import { exportsRouter } from '../../src/routes/exports.js';
import { punchItemsRouter } from '../../src/routes/punch_items.js';
import { sitePhotosRouter } from '../../src/routes/site_photos.js';
import { delayNotesRouter } from '../../src/routes/delay_notes.js';
import { meetingsRouter } from '../../src/routes/meetings.js';
import { purchaseOrdersRouter } from '../../src/routes/purchase_orders.js';
import { equipmentRouter } from '../../src/routes/equipment.js';
import { materialsRouter } from '../../src/routes/materials.js';
import { changeOrdersRouter } from '../../src/routes/change_orders.js';
import { budgetRouter } from '../../src/routes/budget.js';
import { schedulesRouter } from '../../src/routes/schedules.js';
import { analyticsRouter } from '../../src/routes/analytics.js';
import { pushRouter } from '../../src/routes/push.js';
import { paymentsRouter } from '../../src/routes/payments.js';

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
  app.use('/api/defects', defectsRouter);
  app.use('/api/permits', permitsRouter);
  app.use('/api/timesheets', timesheetsRouter);
  app.use('/api/daily-reports', dailyReportsRouter);
  app.use('/api/team-members', teamMembersRouter);
  app.use('/api/rfis', rfisRouter);
  app.use('/api/drawings', drawingsRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/submittals', submittalsRouter);
  app.use('/api/risk-dashboard', riskDashboardRouter);
  app.use('/api/projects/:projectId/timeline', projectTimelineRouter);
  app.use('/api/links', linksRouter);
  app.use('/api/guests', guestsRouter);
  app.use('/api/exports', exportsRouter);
  app.use('/api/punch-items', punchItemsRouter);
  app.use('/api/site-photos', sitePhotosRouter);
  app.use('/api/delay-notes', delayNotesRouter);
  app.use('/api/meetings', meetingsRouter);
  app.use('/api/purchase-orders', purchaseOrdersRouter);
  app.use('/api/equipment', equipmentRouter);
  app.use('/api/materials', materialsRouter);
  app.use('/api/change-orders', changeOrdersRouter);
  app.use('/api/budget', budgetRouter);
  app.use('/api/schedules', schedulesRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/push', pushRouter);
  app.use('/api/payments', paymentsRouter);

  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: { message: 'Endpoint not found', code: 'NOT_FOUND' },
    });
  });

  app.use(errorHandler);

  return app;
}
