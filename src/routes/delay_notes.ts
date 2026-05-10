import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';

const router = Router();

const delayNoteSchema = z.object({
  projectId: z.string().uuid().optional(),
  reason: z.string().min(1).max(255),
  description: z.string().optional(),
  linkedRfiId: z.string().uuid().optional(),
  status: z.enum(['open', 'acknowledged', 'resolved', 'closed']).optional(),
});

const delayNoteIdSchema = z.object({ id: z.string().uuid() });
const statusSchema = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved', 'closed']),
});

// ─── List Delay Notes ──────────────────────────────────────────────────────
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

    if (projectId) { baseWhere += ` AND dn.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)    { baseWhere += ` AND dn.status = $${idx++}`;    baseParams.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) FROM delay_notes dn JOIN projects p ON dn.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT dn.*, p.name as project_name, r.subject as linked_rfi_subject FROM delay_notes dn
       JOIN projects p ON dn.project_id = p.id
       LEFT JOIN rfis r ON dn.linked_rfi_id = r.id
       WHERE ${baseWhere}
       ORDER BY dn.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[DelayNotes] List error:', err);
    errorResponse(res, 'Failed to fetch delay notes', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Delay Note ─────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(delayNoteSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { projectId, reason, description, linkedRfiId } = req.body;

    const result = await query(
      `INSERT INTO delay_notes (project_id, created_by, reason, description, linked_rfi_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [projectId || null, userId, reason, description || null, linkedRfiId || null]
    );

    successResponse(res, result.rows[0], 201);
  } catch (err) {
    console.error('[DelayNotes] Create error:', err);
    errorResponse(res, 'Failed to create delay note', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get Delay Note ──────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(delayNoteIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await query(
      `SELECT dn.*, p.name as project_name, r.subject as linked_rfi_subject FROM delay_notes dn
       JOIN projects p ON dn.project_id = p.id
       LEFT JOIN rfis r ON dn.linked_rfi_id = r.id
       WHERE dn.id = $1 AND p.user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'Delay note not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[DelayNotes] Get error:', err);
    errorResponse(res, 'Failed to fetch delay note', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Delay Note ─────────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(delayNoteIdSchema), validate(delayNoteSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { projectId, reason, description, linkedRfiId, status } = req.body;

    const check = await query(
      `SELECT dn.id FROM delay_notes dn
       JOIN projects p ON dn.project_id = p.id
       WHERE dn.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Delay note not found', 'NOT_FOUND', 404);
    }

    const result = await query(
      `UPDATE delay_notes SET
        project_id = COALESCE($1, project_id),
        reason = COALESCE($2, reason),
        description = COALESCE($3, description),
        linked_rfi_id = COALESCE($4, linked_rfi_id),
        status = COALESCE($5, status),
        updated_at = now()
       WHERE id = $6 RETURNING *`,
      [projectId || null, reason || null, description || null, linkedRfiId || null, status || null, id]
    );

    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[DelayNotes] Update error:', err);
    errorResponse(res, 'Failed to update delay note', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Status ──────────────────────────────────────────────────────────
router.patch('/:id/status', authenticateToken, validateParams(delayNoteIdSchema), validate(statusSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { status } = req.body;

    const check = await query(
      `SELECT dn.id FROM delay_notes dn
       JOIN projects p ON dn.project_id = p.id
       WHERE dn.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Delay note not found', 'NOT_FOUND', 404);
    }

    const result = await query(
      `UPDATE delay_notes SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, id]
    );
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[DelayNotes] Status update error:', err);
    errorResponse(res, 'Failed to update status', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Delay Note ─────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(delayNoteIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const check = await query(
      `SELECT dn.id FROM delay_notes dn
       JOIN projects p ON dn.project_id = p.id
       WHERE dn.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Delay note not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM delay_notes WHERE id = $1', [id]);
    successResponse(res, { deleted: true });
  } catch (err) {
    console.error('[DelayNotes] Delete error:', err);
    errorResponse(res, 'Failed to delete delay note', 'INTERNAL_ERROR', 500);
  }
});

export { router as delayNotesRouter };
