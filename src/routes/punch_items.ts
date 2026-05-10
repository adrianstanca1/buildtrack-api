import { Router } from 'express';
import { z } from 'zod';
import { query, pool } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';
import { linkRecord } from '../utils/links.js';

const router = Router();

const punchItemSchema = z.object({
  projectId: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  location: z.string().max(255).optional(),
  severity: z.enum(['cosmetic', 'minor', 'major', 'critical']).optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  assignee: z.string().max(255).optional(),
  photoUrls: z.array(z.string().url()).optional(),
});

const punchItemIdSchema = z.object({ id: z.string().uuid() });
const statusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
});

// ─── List Punch Items ──────────────────────────────────────────────────────
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

    if (projectId) { baseWhere += ` AND pi.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)    { baseWhere += ` AND pi.status = $${idx++}`;    baseParams.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) FROM punch_items pi JOIN projects p ON pi.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT pi.*, p.name as project_name FROM punch_items pi
       JOIN projects p ON pi.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY pi.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[PunchItems] List error:', err);
    errorResponse(res, 'Failed to fetch punch items', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Punch Item ─────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(punchItemSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { projectId, title, location, severity, assignee, photoUrls } = req.body;

    const result = await query(
      `INSERT INTO punch_items (project_id, created_by, title, location, severity, assignee, photo_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [projectId || null, userId, title, location || null, severity || 'minor', assignee || null,
       JSON.stringify(photoUrls || [])]
    );

    successResponse(res, result.rows[0], 201);
  } catch (err) {
    console.error('[PunchItems] Create error:', err);
    errorResponse(res, 'Failed to create punch item', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get Punch Item ──────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(punchItemIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await query(
      `SELECT pi.*, p.name as project_name FROM punch_items pi
       JOIN projects p ON pi.project_id = p.id
       WHERE pi.id = $1 AND p.user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'Punch item not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[PunchItems] Get error:', err);
    errorResponse(res, 'Failed to fetch punch item', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Punch Item ─────────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(punchItemIdSchema), validate(punchItemSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { projectId, title, location, severity, status, assignee, photoUrls } = req.body;

    const check = await query(
      `SELECT pi.id FROM punch_items pi
       JOIN projects p ON pi.project_id = p.id
       WHERE pi.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Punch item not found', 'NOT_FOUND', 404);
    }

    const result = await query(
      `UPDATE punch_items SET
        project_id = COALESCE($1, project_id),
        title = COALESCE($2, title),
        location = COALESCE($3, location),
        severity = COALESCE($4, severity),
        status = COALESCE($5, status),
        assignee = COALESCE($6, assignee),
        photo_urls = COALESCE($7, photo_urls),
        updated_at = now()
       WHERE id = $8 RETURNING *`,
      [projectId || null, title || null, location || null, severity || null, status || null,
       assignee || null, photoUrls ? JSON.stringify(photoUrls) : null, id]
    );

    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[PunchItems] Update error:', err);
    errorResponse(res, 'Failed to update punch item', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Status ──────────────────────────────────────────────────────────
router.patch('/:id/status', authenticateToken, validateParams(punchItemIdSchema), validate(statusSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { status } = req.body;

    const check = await query(
      `SELECT pi.id FROM punch_items pi
       JOIN projects p ON pi.project_id = p.id
       WHERE pi.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Punch item not found', 'NOT_FOUND', 404);
    }

    const result = await query(
      `UPDATE punch_items SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[PunchItems] Status update error:', err);
    errorResponse(res, 'Failed to update status', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Punch Item ─────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(punchItemIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const check = await query(
      `SELECT pi.id FROM punch_items pi
       JOIN projects p ON pi.project_id = p.id
       WHERE pi.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Punch item not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM punch_items WHERE id = $1', [id]);
    successResponse(res, { deleted: true });
  } catch (err) {
    console.error('[PunchItems] Delete error:', err);
    errorResponse(res, 'Failed to delete punch item', 'INTERNAL_ERROR', 500);
  }
});

export { router as punchItemsRouter };
