"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const database_js_1 = require("../config/database.js");
const validate_js_1 = require("../middleware/validate.js");
const auth_js_1 = require("../middleware/auth.js");
const response_js_1 = require("../utils/response.js");
const router = (0, express_1.Router)();
exports.adminRouter = router;
const userUpdateSchema = zod_1.z.object({
    role: zod_1.z.enum(['user', 'admin', 'super_admin']).optional(),
    subscriptionTier: zod_1.z.enum(['free', 'pro', 'enterprise']).optional(),
    subscriptionStatus: zod_1.z.enum(['active', 'inactive', 'past_due', 'cancelled', 'trialing']).optional(),
});
const userIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
// All admin routes require admin or super_admin
router.use(auth_js_1.authenticateToken, (0, auth_js_1.requireRole)('admin', 'super_admin'));
router.get('/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = (page - 1) * limit;
        const search = req.query.search;
        let countSql = 'SELECT COUNT(*) FROM users';
        let sql = `SELECT id, email, first_name, last_name, role, company_name, subscription_tier, subscription_status, created_at FROM users`;
        const countParams = [];
        const params = [];
        let idx = 1;
        if (search) {
            countSql += ` WHERE email ILIKE $${idx} OR first_name ILIKE $${idx} OR last_name ILIKE $${idx}`;
            sql += ` WHERE email ILIKE $${idx} OR first_name ILIKE $${idx} OR last_name ILIKE $${idx}`;
            countParams.push(`%${search}%`);
            params.push(`%${search}%`);
            idx++;
        }
        sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
        params.push(limit, offset);
        const [countResult, dataResult] = await Promise.all([
            (0, database_js_1.query)(countSql, countParams),
            (0, database_js_1.query)(sql, params),
        ]);
        const total = parseInt(countResult.rows[0].count);
        (0, response_js_1.paginatedResponse)(res, dataResult.rows, total, page, limit);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to fetch users', 'INTERNAL_ERROR', 500);
    }
});
router.put('/users/:id', (0, validate_js_1.validateParams)(userIdSchema), (0, validate_js_1.validate)(userUpdateSchema), async (req, res) => {
    try {
        const userId = req.params.id;
        const updates = [];
        const values = [];
        let idx = 1;
        if (req.body.role !== undefined) {
            updates.push(`role = $${idx++}`);
            values.push(req.body.role);
        }
        if (req.body.subscriptionTier !== undefined) {
            updates.push(`subscription_tier = $${idx++}`);
            values.push(req.body.subscriptionTier);
        }
        if (req.body.subscriptionStatus !== undefined) {
            updates.push(`subscription_status = $${idx++}`);
            values.push(req.body.subscriptionStatus);
        }
        if (updates.length === 0)
            return (0, response_js_1.errorResponse)(res, 'No fields to update', 'VALIDATION_ERROR', 400);
        values.push(userId);
        const sql = `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING id, email, first_name, last_name, role, subscription_tier, subscription_status`;
        const result = await (0, database_js_1.query)(sql, values);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'User not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to update user', 'INTERNAL_ERROR', 500);
    }
});
router.delete('/users/:id', (0, validate_js_1.validateParams)(userIdSchema), async (req, res) => {
    try {
        // Prevent self-deletion
        if (req.params.id === req.user.id) {
            return (0, response_js_1.errorResponse)(res, 'Cannot delete yourself', 'FORBIDDEN', 403);
        }
        const result = await (0, database_js_1.query)('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'User not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, { message: 'User deleted' });
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to delete user', 'INTERNAL_ERROR', 500);
    }
});
router.get('/stats', async (req, res) => {
    try {
        const stats = await (0, database_js_1.query)(`SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'admin') as admin_count,
        (SELECT COUNT(*) FROM users WHERE subscription_status = 'active') as active_subscriptions,
        (SELECT COUNT(*) FROM projects) as total_projects,
        (SELECT COUNT(*) FROM tasks) as total_tasks,
        (SELECT COUNT(*) FROM workers) as total_workers,
        (SELECT COUNT(*) FROM safety_incidents) as total_incidents,
        (SELECT COUNT(*) FROM inspections) as total_inspections,
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days') as new_users_30d,
        (SELECT COUNT(*) FROM projects WHERE created_at > NOW() - INTERVAL '30 days') as new_projects_30d`);
        (0, response_js_1.successResponse)(res, stats.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to fetch platform stats', 'INTERNAL_ERROR', 500);
    }
});
//# sourceMappingURL=admin.js.map