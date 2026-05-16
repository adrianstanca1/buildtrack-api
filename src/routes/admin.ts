import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';

const router = Router();

const userUpdateSchema = z.object({
  role: z.enum(['user', 'admin', 'super_admin']).optional(),
  subscriptionTier: z.enum(['free', 'pro', 'enterprise']).optional(),
  subscriptionStatus: z.enum(['active', 'inactive', 'past_due', 'cancelled', 'trialing']).optional(),
});

const userIdSchema = z.object({ id: z.string().uuid() });

// All admin routes require admin or super_admin
router.use(authenticateToken, requireRole('admin', 'super_admin'));

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: List or retrieve Admin users
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 */


router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    let countSql = 'SELECT COUNT(*) FROM users';
    let sql = `SELECT id, email, first_name, last_name, role, company_name, subscription_tier, subscription_status, created_at FROM users`;
    const countParams: any[] = [];
    const params: any[] = [];
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
      query(countSql, countParams),
      query(sql, params),
    ]);

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    errorResponse(res, 'Failed to fetch users', 'INTERNAL_ERROR', 500);
  }
});

router.put('/users/:id', validateParams(userIdSchema), validate(userUpdateSchema), async (req, res) => {
  try {
    const userId = req.params.id;
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (req.body.role !== undefined) { updates.push(`role = $${idx++}`); values.push(req.body.role); }
    if (req.body.subscriptionTier !== undefined) { updates.push(`subscription_tier = $${idx++}`); values.push(req.body.subscriptionTier); }
    if (req.body.subscriptionStatus !== undefined) { updates.push(`subscription_status = $${idx++}`); values.push(req.body.subscriptionStatus); }

    if (updates.length === 0) return errorResponse(res, 'No fields to update', 'VALIDATION_ERROR', 400);

    values.push(userId);
    const sql = `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING id, email, first_name, last_name, role, subscription_tier, subscription_status`;
    const result = await query(sql, values);

    if (result.rows.length === 0) return errorResponse(res, 'User not found', 'NOT_FOUND', 404);
    successResponse(res, result.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to update user', 'INTERNAL_ERROR', 500);
  }
});

router.delete('/users/:id', validateParams(userIdSchema), async (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.user!.id) {
      return errorResponse(res, 'Cannot delete yourself', 'FORBIDDEN', 403);
    }

    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return errorResponse(res, 'User not found', 'NOT_FOUND', 404);
    successResponse(res, { message: 'User deleted' });
  } catch (err) {
    errorResponse(res, 'Failed to delete user', 'INTERNAL_ERROR', 500);
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await query(
      `SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'admin') as admin_count,
        (SELECT COUNT(*) FROM users WHERE subscription_status = 'active') as active_subscriptions,
        (SELECT COUNT(*) FROM projects) as total_projects,
        (SELECT COUNT(*) FROM tasks) as total_tasks,
        (SELECT COUNT(*) FROM workers) as total_workers,
        (SELECT COUNT(*) FROM safety_incidents) as total_incidents,
        (SELECT COUNT(*) FROM inspections) as total_inspections,
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '30 days') as new_users_30d,
        (SELECT COUNT(*) FROM projects WHERE created_at > NOW() - INTERVAL '30 days') as new_projects_30d`
    );

    successResponse(res, stats.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to fetch platform stats', 'INTERNAL_ERROR', 500);
  }
});

export { router as adminRouter };
