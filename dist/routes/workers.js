"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workersRouter = void 0;
const express_1 = require("express");
/**
 * @swagger
 * /api/workers:
 *   get:
 *     summary: List all workers
 *     tags: [Workers]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of workers
 *       401:
 *         description: Unauthorized
 */
const zod_1 = require("zod");
const database_js_1 = require("../config/database.js");
const validate_js_1 = require("../middleware/validate.js");
const auth_js_1 = require("../middleware/auth.js");
const response_js_1 = require("../utils/response.js");
const router = (0, express_1.Router)();
exports.workersRouter = router;
const workerSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Name is required').max(255),
    role: zod_1.z.enum(['foreman', 'electrician', 'plumber', 'carpenter', 'mason', 'laborer', 'engineer', 'safety-officer']).optional(),
    status: zod_1.z.enum(['active', 'off-duty', 'on-leave']).optional(),
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    hourlyRate: zod_1.z.number().min(0).optional(),
    weeklyHours: zod_1.z.number().min(0).max(168).optional(),
    certifications: zod_1.z.array(zod_1.z.string()).optional(),
    avatarUrl: zod_1.z.string().url().optional().or(zod_1.z.literal('')),
});
const workerIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
router.get('/', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.query.role;
        const status = req.query.status;
        let sql = 'SELECT * FROM workers WHERE user_id = $1';
        const params = [userId];
        let idx = 2;
        if (role) {
            sql += ` AND role = $${idx++}`;
            params.push(role);
        }
        if (status) {
            sql += ` AND status = $${idx++}`;
            params.push(status);
        }
        sql += ` ORDER BY name`;
        const result = await (0, database_js_1.query)(sql, params);
        (0, response_js_1.successResponse)(res, result.rows);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to fetch workers', 'INTERNAL_ERROR', 500);
    }
});
router.post('/', auth_js_1.authenticateToken, (0, validate_js_1.validate)(workerSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, role, status, phone, email, hourlyRate, weeklyHours, certifications, avatarUrl } = req.body;
        const result = await (0, database_js_1.query)(`INSERT INTO workers (user_id, name, role, status, phone, email, hourly_rate, weekly_hours, certifications, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`, [userId, name, role || 'laborer', status || 'active', phone || null, email || null,
            hourlyRate || 0, weeklyHours || 0, JSON.stringify(certifications || []), avatarUrl || null]);
        (0, response_js_1.successResponse)(res, result.rows[0], 201);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to create worker', 'INTERNAL_ERROR', 500);
    }
});
router.get('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(workerIdSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await (0, database_js_1.query)('SELECT * FROM workers WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Worker not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to fetch worker', 'INTERNAL_ERROR', 500);
    }
});
router.put('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(workerIdSchema), (0, validate_js_1.validate)(workerSchema.partial()), async (req, res) => {
    try {
        const userId = req.user.id;
        const workerId = req.params.id;
        const updates = [];
        const values = [];
        let idx = 1;
        const fields = ['name', 'role', 'status', 'phone', 'email', 'hourlyRate', 'weeklyHours', 'certifications', 'avatarUrl'];
        const dbFields = ['name', 'role', 'status', 'phone', 'email', 'hourly_rate', 'weekly_hours', 'certifications', 'avatar_url'];
        for (let i = 0; i < fields.length; i++) {
            const val = req.body[fields[i]];
            if (val !== undefined) {
                updates.push(`${dbFields[i]} = $${idx++}`);
                values.push(fields[i] === 'certifications' ? JSON.stringify(val) : val);
            }
        }
        if (updates.length === 0)
            return (0, response_js_1.errorResponse)(res, 'No fields to update', 'VALIDATION_ERROR', 400);
        values.push(workerId, userId);
        const sql = `UPDATE workers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`;
        const result = await (0, database_js_1.query)(sql, values);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Worker not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to update worker', 'INTERNAL_ERROR', 500);
    }
});
router.delete('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(workerIdSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await (0, database_js_1.query)('DELETE FROM workers WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, userId]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Worker not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, { message: 'Worker deleted' });
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to delete worker', 'INTERNAL_ERROR', 500);
    }
});
//# sourceMappingURL=workers.js.map