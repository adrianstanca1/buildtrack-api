"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectsRouter = void 0;
const express_1 = require("express");
/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: List all projects for the authenticated user
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of projects
 *       401:
 *         description: Unauthorized
 */
const zod_1 = require("zod");
const database_js_1 = require("../config/database.js");
const validate_js_1 = require("../middleware/validate.js");
const auth_js_1 = require("../middleware/auth.js");
const response_js_1 = require("../utils/response.js");
const router = (0, express_1.Router)();
exports.projectsRouter = router;
const projectSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Project name is required').max(255),
    description: zod_1.z.string().optional(),
    location: zod_1.z.string().optional(),
    latitude: zod_1.z.number().optional(),
    longitude: zod_1.z.number().optional(),
    budget: zod_1.z.number().min(0).optional(),
    progress: zod_1.z.number().min(0).max(100).optional(),
    status: zod_1.z.enum(['planning', 'active', 'on-hold', 'completed', 'cancelled']).optional(),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
    color: zod_1.z.string().optional(),
});
const projectIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
// ─── List Projects ──────────────────────────────────────────────────────
router.get('/', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = (page - 1) * limit;
        const status = req.query.status;
        const search = req.query.search;
        const userId = req.user.id;
        let countSql = 'SELECT COUNT(*) FROM projects WHERE user_id = $1';
        let countParams = [userId];
        let sql = `SELECT p.*,
      (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
      (SELECT COUNT(*) FROM workers w JOIN project_workers pw ON w.id = pw.worker_id WHERE pw.project_id = p.id) as worker_count
      FROM projects p WHERE p.user_id = $1`;
        let params = [userId];
        let paramIdx = 2;
        if (status) {
            countSql += ` AND status = $${paramIdx}`;
            sql += ` AND p.status = $${paramIdx}`;
            countParams.push(status);
            params.push(status);
            paramIdx++;
        }
        if (search) {
            countSql += ` AND (name ILIKE $${paramIdx} OR location ILIKE $${paramIdx})`;
            sql += ` AND (p.name ILIKE $${paramIdx} OR p.location ILIKE $${paramIdx})`;
            countParams.push(`%${search}%`);
            params.push(`%${search}%`);
            paramIdx++;
        }
        sql += ` ORDER BY p.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
        params.push(limit, offset);
        const [countResult, dataResult] = await Promise.all([
            (0, database_js_1.query)(countSql, countParams),
            (0, database_js_1.query)(sql, params),
        ]);
        const total = parseInt(countResult.rows[0].count);
        (0, response_js_1.paginatedResponse)(res, dataResult.rows, total, page, limit);
    }
    catch (err) {
        console.error('[Projects] List error:', err);
        (0, response_js_1.errorResponse)(res, 'Failed to fetch projects', 'INTERNAL_ERROR', 500);
    }
});
// ─── Create Project ─────────────────────────────────────────────────────
router.post('/', auth_js_1.authenticateToken, (0, validate_js_1.validate)(projectSchema), async (req, res) => {
    try {
        const { name, description, location, latitude, longitude, budget, status, startDate, endDate, color } = req.body;
        const userId = req.user.id;
        const result = await (0, database_js_1.query)(`INSERT INTO projects (user_id, name, description, location, latitude, longitude, budget, status, start_date, end_date, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`, [userId, name, description || null, location || null, latitude || null, longitude || null,
            budget || 0, status || 'planning', startDate || null, endDate || null, color || '#2563eb']);
        (0, response_js_1.successResponse)(res, result.rows[0], 201);
    }
    catch (err) {
        console.error('[Projects] Create error:', err);
        (0, response_js_1.errorResponse)(res, 'Failed to create project', 'INTERNAL_ERROR', 500);
    }
});
// ─── Get Project ────────────────────────────────────────────────────────
router.get('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(projectIdSchema), async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;
        const result = await (0, database_js_1.query)(`SELECT p.*,
        (SELECT json_agg(t.*) FROM tasks t WHERE t.project_id = p.id) as tasks,
        (SELECT json_agg(json_build_object('id', w.id, 'name', w.name, 'role', w.role, 'status', w.status))
         FROM workers w JOIN project_workers pw ON w.id = pw.worker_id WHERE pw.project_id = p.id) as workers,
        (SELECT json_agg(s.*) FROM safety_incidents s WHERE s.project_id = p.id) as incidents,
        (SELECT json_agg(i.*) FROM inspections i WHERE i.project_id = p.id) as inspections
       FROM projects p WHERE p.id = $1 AND p.user_id = $2`, [projectId, userId]);
        if (result.rows.length === 0) {
            return (0, response_js_1.errorResponse)(res, 'Project not found', 'NOT_FOUND', 404);
        }
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        console.error('[Projects] Get error:', err);
        (0, response_js_1.errorResponse)(res, 'Failed to fetch project', 'INTERNAL_ERROR', 500);
    }
});
// ─── Update Project ───────────────────────────────────────────────────────
router.put('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(projectIdSchema), (0, validate_js_1.validate)(projectSchema.partial()), async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;
        // Verify ownership
        const check = await (0, database_js_1.query)('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
        if (check.rows.length === 0) {
            return (0, response_js_1.errorResponse)(res, 'Project not found', 'NOT_FOUND', 404);
        }
        const updates = [];
        const values = [];
        let idx = 1;
        const fields = ['name', 'description', 'location', 'latitude', 'longitude', 'budget', 'progress', 'status', 'color'];
        const dbFields = ['name', 'description', 'location', 'latitude', 'longitude', 'budget', 'progress', 'status', 'color'];
        const bodyFields = ['name', 'description', 'location', 'latitude', 'longitude', 'budget', 'progress', 'status', 'color'];
        for (let i = 0; i < fields.length; i++) {
            const val = req.body[bodyFields[i]];
            if (val !== undefined) {
                updates.push(`${dbFields[i]} = $${idx++}`);
                values.push(val);
            }
        }
        if (req.body.startDate !== undefined) {
            updates.push(`start_date = $${idx++}`);
            values.push(req.body.startDate);
        }
        if (req.body.endDate !== undefined) {
            updates.push(`end_date = $${idx++}`);
            values.push(req.body.endDate);
        }
        if (updates.length === 0) {
            return (0, response_js_1.errorResponse)(res, 'No fields to update', 'VALIDATION_ERROR', 400);
        }
        values.push(projectId);
        const sql = `UPDATE projects SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
        const result = await (0, database_js_1.query)(sql, values);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        console.error('[Projects] Update error:', err);
        (0, response_js_1.errorResponse)(res, 'Failed to update project', 'INTERNAL_ERROR', 500);
    }
});
// ─── Delete Project ───────────────────────────────────────────────────────
router.delete('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(projectIdSchema), async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;
        const check = await (0, database_js_1.query)('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
        if (check.rows.length === 0) {
            return (0, response_js_1.errorResponse)(res, 'Project not found', 'NOT_FOUND', 404);
        }
        await (0, database_js_1.query)('DELETE FROM projects WHERE id = $1', [projectId]);
        (0, response_js_1.successResponse)(res, { message: 'Project deleted' });
    }
    catch (err) {
        console.error('[Projects] Delete error:', err);
        (0, response_js_1.errorResponse)(res, 'Failed to delete project', 'INTERNAL_ERROR', 500);
    }
});
// ─── Project Stats ──────────────────────────────────────────────────────
router.get('/:id/stats', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(projectIdSchema), async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;
        const check = await (0, database_js_1.query)('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
        if (check.rows.length === 0) {
            return (0, response_js_1.errorResponse)(res, 'Project not found', 'NOT_FOUND', 404);
        }
        const stats = await (0, database_js_1.query)(`SELECT
        (SELECT COUNT(*) FROM tasks WHERE project_id = $1) as total_tasks,
        (SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status = 'completed') as completed_tasks,
        (SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status = 'in-progress') as in_progress_tasks,
        (SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status = 'pending') as pending_tasks,
        (SELECT COUNT(*) FROM workers w JOIN project_workers pw ON w.id = pw.worker_id WHERE pw.project_id = $1) as total_workers,
        (SELECT COUNT(*) FROM safety_incidents WHERE project_id = $1) as total_incidents,
        (SELECT COUNT(*) FROM inspections WHERE project_id = $1) as total_inspections,
        (SELECT COUNT(*) FROM inspections WHERE project_id = $1 AND status = 'passed') as passed_inspections,
        (SELECT budget FROM projects WHERE id = $1) as budget,
        (SELECT spent FROM projects WHERE id = $1) as spent,
        (SELECT progress FROM projects WHERE id = $1) as progress`, [projectId]);
        (0, response_js_1.successResponse)(res, stats.rows[0]);
    }
    catch (err) {
        console.error('[Projects] Stats error:', err);
        (0, response_js_1.errorResponse)(res, 'Failed to fetch project stats', 'INTERNAL_ERROR', 500);
    }
});
// ─── Assign Workers ─────────────────────────────────────────────────────
router.post('/:id/workers', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(projectIdSchema), async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;
        const { workerIds } = req.body;
        if (!Array.isArray(workerIds) || workerIds.length === 0) {
            return (0, response_js_1.errorResponse)(res, 'workerIds array required', 'VALIDATION_ERROR', 400);
        }
        // Verify ownership
        const check = await (0, database_js_1.query)('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
        if (check.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Project not found', 'NOT_FOUND', 404);
        const results = [];
        for (const workerId of workerIds) {
            const workerCheck = await (0, database_js_1.query)('SELECT id FROM workers WHERE id = $1 AND user_id = $2', [workerId, userId]);
            if (workerCheck.rows.length === 0)
                continue;
            const assign = await (0, database_js_1.query)(`INSERT INTO project_workers (project_id, worker_id) VALUES ($1, $2)
         ON CONFLICT (project_id, worker_id) DO NOTHING RETURNING *`, [projectId, workerId]);
            if (assign.rows.length > 0)
                results.push(assign.rows[0]);
        }
        (0, response_js_1.successResponse)(res, { assigned: results.length, workers: results });
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to assign workers', 'INTERNAL_ERROR', 500);
    }
});
router.delete('/:id/workers/:workerId', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(projectIdSchema), async (req, res) => {
    try {
        const projectId = req.params.id;
        const workerId = req.params.workerId;
        const userId = req.user.id;
        const check = await (0, database_js_1.query)('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
        if (check.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Project not found', 'NOT_FOUND', 404);
        await (0, database_js_1.query)('DELETE FROM project_workers WHERE project_id = $1 AND worker_id = $2', [projectId, workerId]);
        (0, response_js_1.successResponse)(res, { message: 'Worker removed from project' });
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to remove worker', 'INTERNAL_ERROR', 500);
    }
});
//# sourceMappingURL=projects.js.map