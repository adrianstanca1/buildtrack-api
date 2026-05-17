import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { paginatedResponse, successResponse } from '../utils/response.js';
import { auditLog } from '../utils/audit.js';

const router = Router();

const coSchema = z.object({
  projectId: z.string().uuid().optional(),
  projectName: z.string().optional(),
  coNumber: z.string().min(1).max(50),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  reason: z.string().optional(),
  type: z.enum(['scope', 'price', 'time', 'design', 'other']).optional(),
  status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn']).optional(),
  requestedBy: z.string().optional(),
  requestedById: z.string().uuid().optional(),
  requestedDate: z.string().optional(),
  originalCost: z.number().min(0).optional(),
  proposedCost: z.number().min(0).optional(),
  originalScheduleDays: z.number().int().min(0).optional(),
  proposedScheduleDays: z.number().int().min(0).optional(),
  reviewedBy: z.string().optional(),
  reviewedById: z.string().uuid().optional(),
  reviewedDate: z.string().optional(),
  approvedBy: z.string().optional(),
  approvedById: z.string().uuid().optional(),
  approvedDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateSchema = coSchema.partial();

// GET /api/change-orders
/**
 * @swagger
 * /api/change-orders:
 *   get:
 *     summary: List or retrieve Change Orders change orders
 *     tags: [Change Orders]
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 */


router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { projectId, status, type, search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    let sql = 'SELECT * FROM change_orders WHERE 1=1';
    let countSql = 'SELECT COUNT(*) FROM change_orders WHERE 1=1';
    const params: any[] = [];

    if (projectId) {
      params.push(projectId);
      sql += ` AND project_id = $${params.length}`;
      countSql += ` AND project_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
      countSql += ` AND status = $${params.length}`;
    }
    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
      countSql += ` AND type = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (co_number ILIKE $${params.length} OR title ILIKE $${params.length} OR description ILIKE $${params.length})`;
      countSql += ` AND (co_number ILIKE $${params.length} OR title ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    sql += ' ORDER BY updated_at DESC';
    params.push(limitNum, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows: items } = await query(sql, params);
    const { rows: countRows } = await query(countSql, params.slice(0, -2));
    const total = parseInt(countRows[0].count);

    return paginatedResponse(res, items, total, pageNum, limitNum);
  } catch (err) { next(err); }
});

// GET /api/change-orders/:id
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM change_orders WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
    return successResponse(res, rows[0]);
  } catch (err) { next(err); }
});

// POST /api/change-orders
router.post('/', authenticateToken, validate(coSchema), async (req, res, next) => {
  try {
    const d = req.body;
    const id = uuidv4();
    const { rows } = await query(`
      INSERT INTO change_orders (
        id, project_id, project_name, co_number, title, description, reason, type, status,
        requested_by, requested_by_id, requested_date,
        original_cost, proposed_cost, original_schedule_days, proposed_schedule_days,
        reviewed_by, reviewed_by_id, reviewed_date,
        approved_by, approved_by_id, approved_date, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
      RETURNING *`, [
      id, d.projectId||null, d.projectName||null, d.coNumber, d.title, d.description||null, d.reason||null,
      d.type||'scope', d.status||'draft', d.requestedBy||null, d.requestedById||null, d.requestedDate||null,
      d.originalCost||null, d.proposedCost||null, d.originalScheduleDays||null, d.proposedScheduleDays||null,
      d.reviewedBy||null, d.reviewedById||null, d.reviewedDate||null,
      d.approvedBy||null, d.approvedById||null, d.approvedDate||null, d.notes||null,
    ]);
    await auditLog({ eventType:'change_order_created', userId: (req as any).user?.id, success: true, details: { changeOrderId: id, coNumber: d.coNumber } });
    return successResponse(res, rows[0], 201);
  } catch (err) { next(err); }
});

// Partial-update handler — shared between PATCH (canonical) and PUT
// (alias for clients that don't distinguish). Both accept the same
// updateSchema = coSchema.partial().
const updateChangeOrder = async (req: any, res: any, next: any) => {
  try {
    const current = await query('SELECT * FROM change_orders WHERE id=$1', [req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });

    const d = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    const add = (col: string, val: any) => { if (val !== undefined) { fields.push(`${col} = $${fields.length + 2}`); values.push(val); } };

    add('project_id', d.projectId);
    add('project_name', d.projectName);
    add('co_number', d.coNumber);
    add('title', d.title);
    add('description', d.description);
    add('reason', d.reason);
    add('type', d.type);
    add('status', d.status);
    add('requested_by', d.requestedBy);
    add('requested_by_id', d.requestedById);
    add('requested_date', d.requestedDate);
    add('original_cost', d.originalCost);
    add('proposed_cost', d.proposedCost);
    add('original_schedule_days', d.originalScheduleDays);
    add('proposed_schedule_days', d.proposedScheduleDays);
    add('reviewed_by', d.reviewedBy);
    add('reviewed_by_id', d.reviewedById);
    add('reviewed_date', d.reviewedDate);
    add('approved_by', d.approvedBy);
    add('approved_by_id', d.approvedById);
    add('approved_date', d.approvedDate);
    add('notes', d.notes);

    if (fields.length === 0) return res.status(400).json({ success: false, error: { message: 'No fields to update', code: 'BAD_REQUEST' } });

    const { rows } = await query(
      `UPDATE change_orders SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );

    await auditLog({ eventType:'change_order_updated', userId: (req as any).user?.id, success: true, details: { changeOrderId: req.params.id } });
    return successResponse(res, rows[0]);
  } catch (err) { next(err); }
};

// PATCH /api/change-orders/:id (canonical)
router.patch('/:id', authenticateToken, validate(updateSchema), updateChangeOrder);

// PUT /api/change-orders/:id (alias — same handler).
// Added so the buildtrack-web EntityDetail component can use a single PUT
// shape across every entity. Without this, change-orders would be the only
// entity needing a PATCH special-case in the frontend.
router.put('/:id', authenticateToken, validate(updateSchema), updateChangeOrder);

// DELETE /api/change-orders/:id
router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM change_orders WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
    await auditLog({ eventType:'change_order_deleted', userId: (req as any).user?.id, success: true, details: { changeOrderId: req.params.id } });
    return successResponse(res, null);
  } catch (err) { next(err); }
});

export { router as changeOrdersRouter };
