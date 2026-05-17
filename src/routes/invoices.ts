import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, pool } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';
import { emitEntityEvent } from '../utils/realtime.js';

const router = Router();

const invoiceSchema = z.object({
  projectId: z.string().uuid().min(1),
  invoiceNumber: z.string().min(1).max(100),
  supplier: z.string().max(255).optional(),
  amount: z.number().min(0).optional(),
  vatAmount: z.number().min(0).optional(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
  dueDate: z.string().max(20).optional(),
  notes: z.string().optional(),
});

const lineItemSchema = z.object({
  invoiceId: z.string().uuid().min(1),
  description: z.string().min(1).max(255),
  quantity: z.number().min(0).optional(),
  unitPrice: z.number().min(0).optional(),
  total: z.number().min(0).optional(),
  cisDeducted: z.boolean().optional(),
});

const invoiceIdSchema = z.object({ id: z.string().uuid() });

// ─── List Invoices ──────────────────────────────────────────────────────
/**
 * @swagger
 * /api/invoices:
 *   get:
 *     summary: List or retrieve Invoices invoices
 *     tags: [Invoices]
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

    if (projectId) { baseWhere += ` AND i.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)    { baseWhere += ` AND i.status = $${idx++}`;    baseParams.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) FROM invoices i JOIN projects p ON i.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT i.*, p.name as project_name FROM invoices i
       JOIN projects p ON i.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY i.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[Invoices] List error:', err);
    errorResponse(res, 'Failed to fetch invoices', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Invoice ─────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(invoiceSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { projectId, invoiceNumber, supplier, amount, vatAmount, status, dueDate, notes } = req.body;
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
    // CIS-aware invoices schema: subtotal (was `amount`), total (was `total_amount`),
    // client_name (was `supplier`). Map the legacy body fields onto the new columns.
    const subtotal = amount || 0;
    const totalAmount = subtotal + (vatAmount || 0);
    const result = await client.query(
      `INSERT INTO invoices (id, project_id, invoice_number, client_name, subtotal, vat_amount, total, status, due_date, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
      [id, projectId, invoiceNumber, supplier || null, subtotal, vatAmount || 0, totalAmount, status || 'draft', dueDate || null, notes || null]
    );

    await client.query('COMMIT');
    emitEntityEvent('invoice', 'created', result.rows[0]);
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Invoices] Create error:', err);
    errorResponse(res, 'Failed to create invoice', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

// ─── Get Invoice ──────────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(invoiceIdSchema), async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*, p.name as project_name FROM invoices i
       JOIN projects p ON i.project_id = p.id
       WHERE i.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return errorResponse(res, 'Invoice not found', 'NOT_FOUND', 404);
    }

    const lineItems = await query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY created_at',
      [req.params.id]
    );

    successResponse(res, { ...result.rows[0], line_items: lineItems.rows });
  } catch (err) {
    console.error('[Invoices] Get error:', err);
    errorResponse(res, 'Failed to fetch invoice', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Invoice ──────────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(invoiceIdSchema), validate(invoiceSchema.partial()), async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const userId = req.user!.id;

    const check = await query(
      `SELECT i.id FROM invoices i JOIN projects p ON i.project_id = p.id WHERE i.id = $1 AND p.user_id = $2`,
      [invoiceId, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Invoice not found', 'NOT_FOUND', 404);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const mappings: Record<string, string> = {
      projectId: 'project_id',
      invoiceNumber: 'invoice_number',
      supplier: 'supplier',
      amount: 'amount',
      vatAmount: 'vat_amount',
      status: 'status',
      dueDate: 'due_date',
      notes: 'notes',
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

    values.push(invoiceId);
    const sql = `UPDATE invoices SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);
    emitEntityEvent('invoice', 'updated', result.rows[0]);
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Invoices] Update error:', err);
    errorResponse(res, 'Failed to update invoice', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Invoice ──────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(invoiceIdSchema), async (req, res) => {
  try {
    const check = await query(
      `SELECT i.id FROM invoices i JOIN projects p ON i.project_id = p.id WHERE i.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Invoice not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [req.params.id]);
    const row_for_emit_invoices = await query('SELECT id, project_id FROM invoices WHERE id = $1', [req.params.id]);
    await query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    emitEntityEvent('invoice', 'deleted', row_for_emit_invoices.rows[0]);
    
    successResponse(res, { message: 'Invoice deleted' });
  } catch (err) {
    console.error('[Invoices] Delete error:', err);
    errorResponse(res, 'Failed to delete invoice', 'INTERNAL_ERROR', 500);
  }
});

// ─── Add Line Item ───────────────────────────────────────────────────────
router.post('/:id/line-items', authenticateToken, validateParams(invoiceIdSchema), validate(lineItemSchema), async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const userId = req.user!.id;

    const check = await query(
      `SELECT i.id FROM invoices i JOIN projects p ON i.project_id = p.id WHERE i.id = $1 AND p.user_id = $2`,
      [invoiceId, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Invoice not found', 'NOT_FOUND', 404);
    }

    const { description, quantity, unitPrice, total, cisDeducted } = req.body;
    const id = uuidv4();
    const result = await query(
      `INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, total, cis_deducted, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`,
      [id, invoiceId, description, quantity || 1, unitPrice || 0, total || 0, cisDeducted || false]
    );

    successResponse(res, result.rows[0], 201);
  } catch (err) {
    console.error('[Invoices] Line item create error:', err);
    errorResponse(res, 'Failed to add line item', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Line Item ────────────────────────────────────────────────────
router.delete('/line-items/:lineId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const check = await query(
      `SELECT li.id FROM invoice_line_items li
       JOIN invoices i ON li.invoice_id = i.id
       JOIN projects p ON i.project_id = p.id
       WHERE li.id = $1 AND p.user_id = $2`,
      [req.params.lineId, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Line item not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM invoice_line_items WHERE id = $1', [req.params.lineId]);
    successResponse(res, { message: 'Line item deleted' });
  } catch (err) {
    console.error('[Invoices] Line item delete error:', err);
    errorResponse(res, 'Failed to delete line item', 'INTERNAL_ERROR', 500);
  }
});

export { router as invoicesRouter };
