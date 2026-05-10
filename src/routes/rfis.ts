import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, pool } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';
import { linkRecord } from '../utils/links.js';

const router = Router();

const rfiSchema = z.object({
  projectId: z.string().uuid().min(1),
  raisedById: z.string().uuid().optional(),
  number: z.string().max(50).optional(),
  subject: z.string().min(1).max(255),
  question: z.string().min(1),
  response: z.string().optional(),
  status: z.enum(['submitted', 'open', 'answered', 'approved', 'rejected', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  dueDate: z.string().max(20).optional(),
  attachmentUrls: z.string().optional(),
  answeredById: z.string().uuid().optional(),
  linkedDrawingId: z.string().uuid().optional(),
  respondedAt: z.string().datetime().optional(),
  approvedById: z.string().uuid().optional(),
  approvedAt: z.string().datetime().optional(),
  rejectedById: z.string().uuid().optional(),
  rejectedAt: z.string().datetime().optional(),
  rejectedReason: z.string().optional(),
});

const rfiIdSchema = z.object({ id: z.string().uuid() });

// ─── List RFIs ─────────────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const projectId = req.query.projectId as string;
    const status = req.query.status as string;
    const priority = req.query.priority as string;

    let baseWhere = 'p.user_id = $1';
    const baseParams: any[] = [userId];
    let idx = 2;

    if (projectId) { baseWhere += ` AND r.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)    { baseWhere += ` AND r.status = $${idx++}`;    baseParams.push(status); }
    if (priority)  { baseWhere += ` AND r.priority = $${idx++}`;  baseParams.push(priority); }

    const countResult = await query(
      `SELECT COUNT(*) FROM rfis r JOIN projects p ON r.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT r.*, p.name as project_name FROM rfis r
       JOIN projects p ON r.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY r.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[RFIs] List error:', err);
    errorResponse(res, 'Failed to fetch RFIs', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create RFI ────────────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(rfiSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      projectId, raisedById, number, subject, question, response, status,
      priority, dueDate, attachmentUrls, linkedDrawingId, answeredById, respondedAt,
      approvedById, approvedAt, rejectedById, rejectedAt, rejectedReason,
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
      `INSERT INTO rfis (
        id, project_id, raised_by_id, number, subject, question, response,
        status, priority, due_date, attachment_urls, answered_by_id,
        responded_at, approved_by_id, approved_at, rejected_by_id,
        rejected_at, rejected_reason, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      RETURNING *`,
      [
        id, projectId, raisedById || null, number || null, subject, question,
        response || null, status || 'submitted', priority || 'normal',
        dueDate || null, attachmentUrls || null, answeredById || null,
        respondedAt || null, approvedById || null, approvedAt || null,
        rejectedById || null, rejectedAt || null, rejectedReason || null,
      ]
    );

    await client.query('COMMIT');

    // Auto-create link to related drawing
    if (linkedDrawingId) {
      await linkRecord('rfi', id, 'drawing', linkedDrawingId, 'linked_drawing', userId);
    }

    successResponse(res, result.rows[0], 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[RFIs] Create error:', err);
    errorResponse(res, 'Failed to create RFI', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

// ─── Get RFI ───────────────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(rfiIdSchema), async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, p.name as project_name FROM rfis r
       JOIN projects p ON r.project_id = p.id
       WHERE r.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return errorResponse(res, 'RFI not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[RFIs] Get error:', err);
    errorResponse(res, 'Failed to fetch RFI', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update RFI ────────────────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(rfiIdSchema), validate(rfiSchema.partial()), async (req, res) => {
  try {
    const rfiId = req.params.id;
    const userId = req.user!.id;

    const check = await query(
      `SELECT r.id FROM rfis r JOIN projects p ON r.project_id = p.id WHERE r.id = $1 AND p.user_id = $2`,
      [rfiId, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'RFI not found', 'NOT_FOUND', 404);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const mappings: Record<string, string> = {
      projectId: 'project_id',
      raisedById: 'raised_by_id',
      number: 'number',
      subject: 'subject',
      question: 'question',
      response: 'response',
      status: 'status',
      priority: 'priority',
      dueDate: 'due_date',
      attachmentUrls: 'attachment_urls',
      answeredById: 'answered_by_id',
      respondedAt: 'responded_at',
      approvedById: 'approved_by_id',
      approvedAt: 'approved_at',
      rejectedById: 'rejected_by_id',
      rejectedAt: 'rejected_at',
      rejectedReason: 'rejected_reason',
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

    values.push(rfiId);
    const sql = `UPDATE rfis SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[RFIs] Update error:', err);
    errorResponse(res, 'Failed to update RFI', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete RFI ────────────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(rfiIdSchema), async (req, res) => {
  try {
    const check = await query(
      `SELECT r.id FROM rfis r JOIN projects p ON r.project_id = p.id WHERE r.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'RFI not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM rfis WHERE id = $1', [req.params.id]);
    successResponse(res, { message: 'RFI deleted' });
  } catch (err) {
    console.error('[RFIs] Delete error:', err);
    errorResponse(res, 'Failed to delete RFI', 'INTERNAL_ERROR', 500);
  }
});

export { router as rfisRouter };
