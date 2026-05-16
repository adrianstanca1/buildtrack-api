import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, pool } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';
import { auditLog } from '../utils/audit.js';
import { linkRecord } from '../utils/links.js';

const router = Router();

const submittalSchema = z.object({
  projectId: z.string().uuid().min(1),
  submittalNumber: z.string().min(1).max(100),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  specSection: z.string().max(50).optional(),
  type: z.enum(['shop_drawing', 'product_data', 'sample', 'mockup', 'closeout', 'other']).optional(),
  status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'approved_as_noted', 'rejected', 'resubmit', 'closed']).optional(),
  ballInCourt: z.string().uuid().optional(),
  reviewerId: z.string().uuid().optional(),
  responsibleCompany: z.string().max(255).optional(),
  dueDate: z.string().max(20).optional(),
  linkedDrawingId: z.string().uuid().optional(),
  linkedRfiId: z.string().uuid().optional(),
  linkedSpecDoc: z.string().optional(),
  attachmentUrls: z.string().optional(),
});

const submittalIdSchema = z.object({ id: z.string().uuid() });

// ─── List Submittals ─────────────────────────────────────────────────────
/**
 * @swagger
 * /api/submittals:
 *   get:
 *     summary: List or retrieve Submittals submittals
 *     tags: [Submittals]
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

    if (projectId) { baseWhere += ` AND s.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)    { baseWhere += ` AND s.status = $${idx++}`;    baseParams.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) FROM submittals s JOIN projects p ON s.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT s.*, p.name as project_name, u.email as ball_in_court_email
       FROM submittals s
       JOIN projects p ON s.project_id = p.id
       LEFT JOIN users u ON s.ball_in_court = u.id
       WHERE ${baseWhere}
       ORDER BY s.due_date ASC NULLS LAST, s.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[Submittals] List error:', err);
    errorResponse(res, 'Failed to fetch submittals', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Submittal ──────────────────────────────────────────────────
router.post('/', authenticateToken, validate(submittalSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      projectId, submittalNumber, title, description, specSection, type, status,
      ballInCourt, reviewerId, responsibleCompany, dueDate, linkedDrawingId, linkedRfiId, linkedSpecDoc, attachmentUrls,
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
      `INSERT INTO submittals (
        id, project_id, submittal_number, title, description, spec_section, type,
        status, ball_in_court, reviewer_id, responsible_company, due_date,
        linked_drawing_id, linked_spec_doc, attachment_urls, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()) RETURNING *`,
      [
        id, projectId, submittalNumber, title, description || null, specSection || null,
        type || 'shop_drawing', status || 'draft', ballInCourt || null, reviewerId || null,
        responsibleCompany || null, dueDate || null, linkedDrawingId || null,
        linkedSpecDoc || null, attachmentUrls ? JSON.parse(attachmentUrls) : '[]', userId,
      ]
    );

    // Auto-create links to related records
    if (linkedDrawingId) {
      await linkRecord('submittal', id, 'drawing', linkedDrawingId, 'linked_drawing', userId);
    }
    if (linkedRfiId) {
      await linkRecord('submittal', id, 'rfi', linkedRfiId, 'linked_rfi', userId);
    }

    await auditLog({
      userId,
      eventType: 'submittal_created',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      details: { submittalId: id, projectId, linkedDrawingId, linkedRfiId },
    });
    await client.query('COMMIT');
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Submittals] Create error:', err);
    errorResponse(res, 'Failed to create submittal', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

// ─── Get Submittal ───────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(submittalIdSchema), async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, p.name as project_name, u.email as ball_in_court_email
       FROM submittals s
       JOIN projects p ON s.project_id = p.id
       LEFT JOIN users u ON s.ball_in_court = u.id
       WHERE s.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return errorResponse(res, 'Submittal not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Submittals] Get error:', err);
    errorResponse(res, 'Failed to fetch submittal', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Submittal ────────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(submittalIdSchema), validate(submittalSchema.partial()), async (req, res) => {
  try {
    const submittalId = req.params.id;
    const userId = req.user!.id;

    const check = await query(
      `SELECT s.id FROM submittals s JOIN projects p ON s.project_id = p.id WHERE s.id = $1 AND p.user_id = $2`,
      [submittalId, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Submittal not found', 'NOT_FOUND', 404);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const mappings: Record<string, string> = {
      projectId: 'project_id',
      submittalNumber: 'submittal_number',
      title: 'title',
      description: 'description',
      specSection: 'spec_section',
      type: 'type',
      status: 'status',
      ballInCourt: 'ball_in_court',
      reviewerId: 'reviewer_id',
      responsibleCompany: 'responsible_company',
      dueDate: 'due_date',
      linkedDrawingId: 'linked_drawing_id',
      linkedSpecDoc: 'linked_spec_doc',
      attachmentUrls: 'attachment_urls',
    };

    for (const [bodyKey, dbKey] of Object.entries(mappings)) {
      if (req.body[bodyKey] !== undefined) {
        updates.push(`${dbKey} = $${idx++}`);
        values.push(bodyKey === 'attachmentUrls' ? JSON.parse(req.body[bodyKey]) : req.body[bodyKey]);
      }
    }

    if (updates.length === 0) {
      return errorResponse(res, 'No fields to update', 'VALIDATION_ERROR', 400);
    }

    values.push(submittalId);
    const sql = `UPDATE submittals SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);

    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Submittals] Update error:', err);
    errorResponse(res, 'Failed to update submittal', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Submittal ────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(submittalIdSchema), async (req, res) => {
  try {
    const check = await query(
      `SELECT s.id FROM submittals s JOIN projects p ON s.project_id = p.id WHERE s.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Submittal not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM submittals WHERE id = $1', [req.params.id]);
    successResponse(res, { message: 'Submittal deleted' });
  } catch (err) {
    console.error('[Submittals] Delete error:', err);
    errorResponse(res, 'Failed to delete submittal', 'INTERNAL_ERROR', 500);
  }
});

// ─── Change Status ───────────────────────────────────────────────────────
router.patch('/:id/status', authenticateToken, validateParams(submittalIdSchema), async (req, res) => {
  const statusSchema = z.object({
    status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'approved_as_noted', 'rejected', 'resubmit', 'closed']),
    response: z.string().optional(),
  });
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return errorResponse(res, 'Invalid status value', 'VALIDATION_ERROR', 400);
  }

  try {
    const userId = req.user!.id;
    const check = await query(
      `SELECT s.id FROM submittals s JOIN projects p ON s.project_id = p.id WHERE s.id = $1 AND p.user_id = $2`,
      [req.params.id, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Submittal not found', 'NOT_FOUND', 404);
    }

    const result = await query(
      'UPDATE submittals SET status = $1, response = COALESCE($2, response), reviewed_at = NOW(), updated_at = NOW() WHERE id = $3 RETURNING *',
      [parsed.data.status, parsed.data.response || null, req.params.id]
    );
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Submittals] Status change error:', err);
    errorResponse(res, 'Failed to update status', 'INTERNAL_ERROR', 500);
  }
});

export { router as submittalsRouter };
