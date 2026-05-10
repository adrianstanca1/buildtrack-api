"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_js_1 = require("./config/swagger.js");
const requestLogger_js_1 = require("./middleware/requestLogger.js");
const performance_js_1 = require("./middleware/performance.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const auth_js_1 = require("./routes/auth.js");
const projects_js_1 = require("./routes/projects.js");
const tasks_js_1 = require("./routes/tasks.js");
const workers_js_1 = require("./routes/workers.js");
const safety_js_1 = require("./routes/safety.js");
const inspections_js_1 = require("./routes/inspections.js");
const notifications_js_1 = require("./routes/notifications.js");
const dashboard_js_1 = require("./routes/dashboard.js");
const admin_js_1 = require("./routes/admin.js");
const uploads_js_1 = require("./routes/uploads.js");
const database_js_1 = require("./config/database.js");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.set('trust proxy', 1);
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || '*',
        credentials: true,
    },
});
exports.io = io;
const PORT = parseInt(process.env.PORT || '3001', 10);
// ─── Security Middleware ──────────────────────────────────────────────
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN?.split(',') || true,
    credentials: true,
}));
app.use((0, compression_1.default)());
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, morgan_1.default)(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// ─── Rate Limiting ──────────────────────────────────────────────────
const limiter = (0, express_rate_limit_1.default)({
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
// ─── Logging & Performance ──────────────────────────────────────────────
app.use(requestLogger_js_1.requestLogger);
app.use(performance_js_1.performanceMiddleware);
// ─── Swagger Docs ───────────────────────────────────────────────────────
app.use('/api/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_js_1.swaggerSpec, {
    explorer: true,
    customSiteTitle: 'BuildTrack API Docs',
}));
// ─── Health Check ─────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ─── API Routes ─────────────────────────────────────────────────────────
app.use('/api/auth', auth_js_1.authRouter);
app.use('/api/projects', projects_js_1.projectsRouter);
app.use('/api/tasks', tasks_js_1.tasksRouter);
app.use('/api/workers', workers_js_1.workersRouter);
app.use('/api/safety', safety_js_1.safetyRouter);
app.use('/api/inspections', inspections_js_1.inspectionsRouter);
app.use('/api/notifications', notifications_js_1.notificationsRouter);
app.use('/api/dashboard', dashboard_js_1.dashboardRouter);
app.use('/api/admin', admin_js_1.adminRouter);
app.use('/api/uploads', uploads_js_1.uploadsRouter);
// ─── Static File Serving (uploads) ────────────────────────────────────
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
// ─── 404 Handler ──────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        error: { message: 'Endpoint not found', code: 'NOT_FOUND' },
    });
});
// ─── Global Error Handler ─────────────────────────────────────────────
app.use(errorHandler_js_1.errorHandler);
// ─── Socket.IO ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);
    socket.on('join-project', (projectId) => {
        socket.join(`project:${projectId}`);
        console.log(`[Socket] ${socket.id} joined project:${projectId}`);
    });
    socket.on('leave-project', (projectId) => {
        socket.leave(`project:${projectId}`);
        console.log(`[Socket] ${socket.id} left project:${projectId}`);
    });
    socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
});
// Make io available globally for emitters
global.io = io;
// ─── Server Startup ───────────────────────────────────────────────────
async function startServer() {
    try {
        // Test database connection
        const client = await database_js_1.pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        console.log('[DB] Connected:', result.rows[0].now);
        // Initialize database tables
        await (0, database_js_1.initDatabase)();
        console.log('[DB] Tables initialized');
        httpServer.listen(PORT, () => {
            console.log(`[Server] BuildTrack API running on port ${PORT}`);
            console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`[Server] Health check: http://localhost:${PORT}/health`);
        });
    }
    catch (err) {
        console.error('[Server] Failed to start:', err);
        process.exit(1);
    }
}
startServer();
// ─── Graceful Shutdown ────────────────────────────────────────────────
process.on('SIGTERM', async () => {
    console.log('[Server] SIGTERM received. Shutting down gracefully...');
    await database_js_1.pool.end();
    httpServer.close(() => {
        console.log('[Server] HTTP server closed');
        process.exit(0);
    });
});
// Health check at /api/health too (for nginx proxy consistency)
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'buildtrack-api', timestamp: new Date().toISOString() });
});
//# sourceMappingURL=server.js.map