import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';

import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';
import { workersRouter } from './routes/workers.js';
import { safetyRouter } from './routes/safety.js';
import { inspectionsRouter } from './routes/inspections.js';
import { notificationsRouter } from './routes/notifications.js';
import { dashboardRouter } from './routes/dashboard.js';
import { adminRouter } from './routes/admin.js';
import { pool } from './config/database.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    credentials: true,
  },
});

const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── Security Middleware ──────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || true,
  credentials: true,
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Rate Limiting ──────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { message: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
    });
  },
});
app.use('/api/', limiter);

// ─── Health Check ─────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ─────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/workers', workersRouter);
app.use('/api/safety', safetyRouter);
app.use('/api/inspections', inspectionsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/admin', adminRouter);

// ─── Static File Serving (uploads) ────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ─── 404 Handler ──────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { message: 'Endpoint not found', code: 'NOT_FOUND' },
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────
app.use(errorHandler);

// ─── Socket.IO ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('join-project', (projectId: string) => {
    socket.join(`project:${projectId}`);
    console.log(`[Socket] ${socket.id} joined project:${projectId}`);
  });

  socket.on('leave-project', (projectId: string) => {
    socket.leave(`project:${projectId}`);
    console.log(`[Socket] ${socket.id} left project:${projectId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Make io available globally for emitters
(global as any).io = io;

// ─── Server Startup ───────────────────────────────────────────────────
async function startServer() {
  try {
    // Test database connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log('[DB] Connected:', result.rows[0].now);

    httpServer.listen(PORT, () => {
      console.log(`[Server] BuildTrack API running on port ${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

startServer();

// ─── Graceful Shutdown ────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received. Shutting down gracefully...');
  await pool.end();
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

export { io };
