import { Router } from 'express';

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

import { z } from 'zod';
import { query } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

const workerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  role: z.enum(['foreman', 'electrician', 'plumber', 'carpenter', 'mason', 'laborer', 'engineer', 'safety-officer']).optional(),
  status: z.enum(['active', 'off-duty', 'on-leave']).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  hourlyRate: z.number().min(0).optional(),
  weeklyHours: z.number().min(0).max(168).optional(),
  certifications: z.array(z.string()).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});

const workerIdSchema = z.object({ id: z.string().uuid() });

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const role = req.query.role as string;
    const status = req.query.status as string;

    let sql = 'SELECT * FROM workers WHERE user_id = $1';
    const params: any[] = [userId];
    let idx = 2;

    if (role) { sql += ` AND role = $${idx++}`; params.push(role); }
    if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
    sql += ` ORDER BY name`;

    const result = await query(sql, params);
    successResponse(res, result.rows);
  } catch (err) {
    errorResponse(res, 'Failed to fetch workers', 'INTERNAL_ERROR', 500);
  }
});

router.post('/', authenticateToken, validate(workerSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { name, role, status, phone, email, hourlyRate, weeklyHours, certifications, avatarUrl } = req.body;

    const result = await query(
      `INSERT INTO workers (user_id, name, role, status, phone, email, hourly_rate, weekly_hours, certifications, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [userId, name, role || 'laborer', status || 'active', phone || null, email || null,
       hourlyRate || 0, weeklyHours || 0, JSON.stringify(certifications || []), avatarUrl || null]
    );
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    errorResponse(res, 'Failed to create worker', 'INTERNAL_ERROR', 500);
  }
});

router.get('/:id', authenticateToken, validateParams(workerIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query('SELECT * FROM workers WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (result.rows.length === 0) return errorResponse(res, 'Worker not found', 'NOT_FOUND', 404);
    successResponse(res, result.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to fetch worker', 'INTERNAL_ERROR', 500);
  }
});

router.put('/:id', authenticateToken, validateParams(workerIdSchema), validate(workerSchema.partial()), async (req, res) => {
  try {
    const userId = req.user!.id;
    const workerId = req.params.id;

    const updates: string[] = [];
    const values: any[] = [];
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

    if (updates.length === 0) return errorResponse(res, 'No fields to update', 'VALIDATION_ERROR', 400);

    values.push(workerId, userId);
    const sql = `UPDATE workers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) return errorResponse(res, 'Worker not found', 'NOT_FOUND', 404);
    successResponse(res, result.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to update worker', 'INTERNAL_ERROR', 500);
  }
});

router.delete('/:id', authenticateToken, validateParams(workerIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query('DELETE FROM workers WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, userId]);
    if (result.rows.length === 0) return errorResponse(res, 'Worker not found', 'NOT_FOUND', 404);
    successResponse(res, { message: 'Worker deleted' });
  } catch (err) {
    errorResponse(res, 'Failed to delete worker', 'INTERNAL_ERROR', 500);
  }
});

export { router as workersRouter };
