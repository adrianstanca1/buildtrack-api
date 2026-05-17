import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, pool } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';
import { emitEntityEvent } from '../utils/realtime.js';

const router = Router();

const permitSchema = z.object({
  projectId: z.string().uuid().min(1),
  title: z.string().min(1).max(255),
  type: z.enum(['hot_work', 'confined_space', 'excavation', 'working_at_height', 'electrical', 'general']),
  status: z.enum(['draft', 'pending', 'active', 'expired', 'cancelled']).optional(),
  location: z.string().optional(),
  issuedBy: z.string().optional(),
  issuedTo: z.string().optional(),
  validFrom: z.string().datetime().optional(),
  validTo: z.string().datetime().optional(),
  conditions: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

const permitIdSchema = z.object({ id: z.string().uuid() });

// ─── List Permits ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/permits:
 *   get:
 *     summary: List or retrieve Permits permits
 *     tags: [Permits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 */


router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const projectId = req.query.projectId as string;
    const status = req.query.status as string;
    const type = req.query.type as string;

    let baseWhere = 'p.user_id = $1';
    const baseParams: any[] = [userId];
    let idx = 2;

    if (projectId) { baseWhere += ` AND pt.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)      { baseWhere += ` AND pt.status = $${idx++}`;     baseParams.push(status); }
    if (type)        { baseWhere += ` AND pt.type = $${idx++}`;       baseParams.push(type); }

    const countResult = await query(
      `SELECT COUNT(*) FROM permits pt JOIN projects p ON pt.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT pt.*, p.name as project_name FROM permits pt
       JOIN projects p ON pt.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY pt.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[Permits] List error:', err);
    errorResponse(res, 'Failed to fetch permits', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Permit ───────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(permitSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      projectId, title, type, status, location, issuedBy, issuedTo,
      validFrom, validTo, conditions, riskLevel,
    } = req.body;
    const userId = req.user!.id;

    const projectCheck = await client.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
    }

    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO permits (id, project_id, title, type, status, location, issued_by, issued_to, valid_from, valid_to, conditions, risk_level, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()) RETURNING *`,
      [id, projectId, title, type, status || 'draft', location || null, issuedBy || null,
       issuedTo || null, validFrom || null, validTo || null, conditions || null, riskLevel || 'medium']
    );

    await client.query('COMMIT');
    emitEntityEvent('permit', 'created', result.rows[0]);
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Permits] Create error:', err);
    errorResponse(res, 'Failed to create permit', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

// ─── Get Permit ──────────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(permitIdSchema), async (req, res) => {
  try {
    const result = await query(
      `SELECT pt.*, p.name as project_name FROM permits pt
       JOIN projects p ON pt.project_id = p.id
       WHERE pt.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return errorResponse(res, 'Permit not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Permits] Get error:', err);
    errorResponse(res, 'Failed to fetch permit', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Permit ───────────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(permitIdSchema), validate(permitSchema.partial()), async (req, res) => {
  try {
    const permitId = req.params.id;
    const userId = req.user!.id;

    const check = await query(
      `SELECT pt.id FROM permits pt JOIN projects p ON pt.project_id = p.id WHERE pt.id = $1 AND p.user_id = $2`,
      [permitId, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Permit not found', 'NOT_FOUND', 404);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const mappings: Record<string, string> = {
      projectId: 'project_id',
      title: 'title',
      type: 'type',
      status: 'status',
      location: 'location',
      issuedBy: 'issued_by',
      issuedTo: 'issued_to',
      validFrom: 'valid_from',
      validTo: 'valid_to',
      conditions: 'conditions',
      riskLevel: 'risk_level',
    };

    for (const [bodyKey, dbKey] of Object.entries(mappings)) {
      if (req.body[bodyKey] !== undefined) {
        updates.push(`${dbKey} = $${idx++}`);
        values.push(req.body[bodyKey]);
      }
    }

    if (updates.length === 0) {
      return errorResponse(res, 'No fields to update', 'VALIDATION_ERROR', 400);
    }

    values.push(permitId);
    const sql = `UPDATE permits SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);
    emitEntityEvent('permit', 'updated', result.rows[0]);
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Permits] Update error:', err);
    errorResponse(res, 'Failed to update permit', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Permit ───────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(permitIdSchema), async (req, res) => {
  try {
    const check = await query(
      `SELECT pt.id FROM permits pt JOIN projects p ON pt.project_id = p.id WHERE pt.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Permit not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM permits WHERE id = $1', [req.params.id]);
    successResponse(res, { message: 'Permit deleted' });
  } catch (err) {
    console.error('[Permits] Delete error:', err);
    errorResponse(res, 'Failed to delete permit', 'INTERNAL_ERROR', 500);
  }
});

export { router as permitsRouter };
