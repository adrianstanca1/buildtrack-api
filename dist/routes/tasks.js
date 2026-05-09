"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tasksRouter = void 0;
const express_1 = require("express");
/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: List all tasks for the authenticated user
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tasks
 *       401:
 *         description: Unauthorized
 */
const zod_1 = require("zod");
const database_js_1 = require("../config/database.js");
const validate_js_1 = require("../middleware/validate.js");
const auth_js_1 = require("../middleware/auth.js");
const response_js_1 = require("../utils/response.js");
const router = (0, express_1.Router)();
exports.tasksRouter = router;
const taskSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid().optional(),
    title: zod_1.z.string().min(1, 'Title is required').max(255),
    description: zod_1.z.string().optional(),
    assignedTo: zod_1.z.string().uuid().optional(),
    priority: zod_1.z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    status: zod_1.z.enum(['pending', 'in-progress', 'completed']).optional(),
    dueDate: zod_1.z.string().datetime().optional(),
});
const taskIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
router.get('/', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const projectId = req.query.projectId;
        const status = req.query.status;
        const priority = req.query.priority;
        let sql = `SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE (t.assigned_to = $1 OR p.user_id = $1)`;
        const params = [userId];
        let idx = 2;
        if (projectId) {
            sql += ` AND t.project_id = $${idx++}`;
            params.push(projectId);
        }
        if (status) {
            sql += ` AND t.status = $${idx++}`;
            params.push(status);
        }
        if (priority) {
            sql += ` AND t.priority = $${idx++}`;
            params.push(priority);
        }
        sql += ` ORDER BY t.created_at DESC`;
        const result = await (0, database_js_1.query)(sql, params);
        (0, response_js_1.successResponse)(res, result.rows);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to fetch tasks', 'INTERNAL_ERROR', 500);
    }
});
router.post('/', auth_js_1.authenticateToken, (0, validate_js_1.validate)(taskSchema), async (req, res) => {
    try {
        const { projectId, title, description, assignedTo, priority, status, dueDate } = req.body;
        const userId = req.user.id;
        // Verify project ownership if projectId provided
        if (projectId) {
            const check = await (0, database_js_1.query)('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
            if (check.rows.length === 0)
                return (0, response_js_1.errorResponse)(res, 'Project not found', 'NOT_FOUND', 404);
        }
        const result = await (0, database_js_1.query)(`INSERT INTO tasks (project_id, title, description, assigned_to, priority, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [projectId || null, title, description || null, assignedTo || null, priority || 'medium', status || 'pending', dueDate || null]);
        (0, response_js_1.successResponse)(res, result.rows[0], 201);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to create task', 'INTERNAL_ERROR', 500);
    }
});
router.get('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(taskIdSchema), async (req, res) => {
    try {
        const result = await (0, database_js_1.query)(`SELECT t.*, p.name as project_name, p.user_id as project_owner_id FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = $1`, [req.params.id]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Task not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to fetch task', 'INTERNAL_ERROR', 500);
    }
});
router.put('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(taskIdSchema), (0, validate_js_1.validate)(taskSchema.partial()), async (req, res) => {
    try {
        const taskId = req.params.id;
        const updates = [];
        const values = [];
        let idx = 1;
        if (req.body.title !== undefined) {
            updates.push(`title = $${idx++}`);
            values.push(req.body.title);
        }
        if (req.body.description !== undefined) {
            updates.push(`description = $${idx++}`);
            values.push(req.body.description);
        }
        if (req.body.assignedTo !== undefined) {
            updates.push(`assigned_to = $${idx++}`);
            values.push(req.body.assignedTo);
        }
        if (req.body.priority !== undefined) {
            updates.push(`priority = $${idx++}`);
            values.push(req.body.priority);
        }
        if (req.body.status !== undefined) {
            updates.push(`status = $${idx++}`);
            values.push(req.body.status);
        }
        if (req.body.dueDate !== undefined) {
            updates.push(`due_date = $${idx++}`);
            values.push(req.body.dueDate);
        }
        if (updates.length === 0)
            return (0, response_js_1.errorResponse)(res, 'No fields to update', 'VALIDATION_ERROR', 400);
        values.push(taskId);
        const sql = `UPDATE tasks SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
        const result = await (0, database_js_1.query)(sql, values);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Task not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to update task', 'INTERNAL_ERROR', 500);
    }
});
router.delete('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(taskIdSchema), async (req, res) => {
    try {
        const result = await (0, database_js_1.query)('DELETE FROM tasks WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Task not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, { message: 'Task deleted' });
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to delete task', 'INTERNAL_ERROR', 500);
    }
});
router.post('/:id/complete', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(taskIdSchema), async (req, res) => {
    try {
        const result = await (0, database_js_1.query)(`UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Task not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to complete task', 'INTERNAL_ERROR', 500);
    }
});
//# sourceMappingURL=tasks.js.map