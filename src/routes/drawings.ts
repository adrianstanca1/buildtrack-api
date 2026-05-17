import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, pool } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';
import { linkRecord } from '../utils/links.js';
import { emitEntityEvent } from '../utils/realtime.js';

const router = Router();

const drawingSchema = z.object({
  projectId: z.string().uuid().min(1),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  fileUrl: z.string().url(),
  version: z.string().max(20).optional(),
  status: z.enum(['current', 'superseded', 'archived']).optional(),
  linkedRfiId: z.string().uuid().optional(),
  linkedSubmittalId: z.string().uuid().optional(),
});

const drawingIdSchema = z.object({ id: z.string().uuid() });

// ─── List Drawings ────────────────────────────────────────────────────────
/**
 * @swagger
 * /api/drawings:
 *   get:
 *     summary: List or retrieve Drawings drawings
 *     tags: [Drawings]
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

    let baseWhere = 'p.user_id = $1';
    const baseParams: any[] = [userId];
    let idx = 2;

    if (projectId) { baseWhere += ` AND d.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)    { baseWhere += ` AND d.status = $${idx++}`;    baseParams.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) FROM drawings d JOIN projects p ON d.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT d.*, p.name as project_name FROM drawings d
       JOIN projects p ON d.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY d.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[Drawings] List error:', err);
    errorResponse(res, 'Failed to fetch drawings', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Drawing ──────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(drawingSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { projectId, title, description, fileUrl, version, status, linkedRfiId, linkedSubmittalId } = req.body;
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
    // Schema columns: project_id, uploaded_by_id, title, revision, file_url, status.
    // `description` is accepted by zod for forward-compat but not persisted yet.
    const result = await client.query(
      `INSERT INTO drawings (id, project_id, title, revision, file_url, status, uploaded_by_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *`,
      [id, projectId, title, version || '1.0', fileUrl, status || 'active', userId]
    );

    await client.query('COMMIT');

    // Auto-create links to related records
    if (linkedRfiId) {
      await linkRecord('drawing', id, 'rfi', linkedRfiId, 'linked_rfi', userId);
    }
    if (linkedSubmittalId) {
      await linkRecord('drawing', id, 'submittal', linkedSubmittalId, 'linked_submittal', userId);
    }

    emitEntityEvent('drawing', 'created', result.rows[0]);
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Drawings] Create error:', err);
    errorResponse(res, 'Failed to create drawing', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

// ─── Get Drawing ───────────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(drawingIdSchema), async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, p.name as project_name FROM drawings d
       JOIN projects p ON d.project_id = p.id
       WHERE d.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return errorResponse(res, 'Drawing not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Drawings] Get error:', err);
    errorResponse(res, 'Failed to fetch drawing', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Drawing ──────────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(drawingIdSchema), validate(drawingSchema.partial()), async (req, res) => {
  try {
    const drawingId = req.params.id;
    const userId = req.user!.id;

    const check = await query(
      `SELECT d.id FROM drawings d JOIN projects p ON d.project_id = p.id WHERE d.id = $1 AND p.user_id = $2`,
      [drawingId, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Drawing not found', 'NOT_FOUND', 404);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const mappings: Record<string, string> = {
      projectId: 'project_id',
      title: 'title',
      description: 'description',
      fileUrl: 'file_url',
      version: 'version',
      status: 'status',
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

    values.push(drawingId);
    const sql = `UPDATE drawings SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);
    emitEntityEvent('drawing', 'updated', result.rows[0]);
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Drawings] Update error:', err);
    errorResponse(res, 'Failed to update drawing', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Drawing ──────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(drawingIdSchema), async (req, res) => {
  try {
    const check = await query(
      `SELECT d.id FROM drawings d JOIN projects p ON d.project_id = p.id WHERE d.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Drawing not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM drawing_pins WHERE drawing_id = $1', [req.params.id]);
    const row_for_emit_drawings = await query('SELECT id, project_id FROM drawings WHERE id = $1', [req.params.id]);
    await query('DELETE FROM drawings WHERE id = $1', [req.params.id]);
    emitEntityEvent('drawing', 'deleted', row_for_emit_drawings.rows[0]);
    
    successResponse(res, { message: 'Drawing deleted' });
  } catch (err) {
    console.error('[Drawings] Delete error:', err);
    errorResponse(res, 'Failed to delete drawing', 'INTERNAL_ERROR', 500);
  }
});

export { router as drawingsRouter };
