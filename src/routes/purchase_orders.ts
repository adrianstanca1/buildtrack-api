import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';
import { auditLog } from '../utils/audit.js';

const router = Router();

const poItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().min(0),
  unit: z.string().max(50).optional(),
  unitPrice: z.number().min(0),
  totalPrice: z.number().min(0).optional(),
});

const purchaseOrderSchema = z.object({
  projectId: z.string().uuid().min(1),
  poNumber: z.string().min(1).max(100),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  vendorName: z.string().min(1).max(255),
  vendorEmail: z.string().email().optional().or(z.literal('')),
  vendorPhone: z.string().max(50).optional(),
  status: z.enum(['draft', 'sent', 'acknowledged', 'partially_delivered', 'delivered', 'invoiced', 'paid', 'cancelled']).optional(),
  items: z.array(poItemSchema).optional(),
  subtotal: z.number().min(0).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  taxAmount: z.number().min(0).optional(),
  total: z.number().min(0).optional(),
  deliveryDate: z.string().max(20).optional(),
  expectedDelivery: z.string().max(20).optional(),
  deliveryAddress: z.string().max(500).optional(),
  notes: z.string().optional(),
});

const poIdSchema = z.object({ id: z.string().uuid() });

// ─── List Purchase Orders ────────────────────────────────────────────────
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

    if (projectId) { baseWhere += ` AND po.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)    { baseWhere += ` AND po.status = $${idx++}`;    baseParams.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) FROM purchase_orders po JOIN projects p ON po.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT po.*, p.name as project_name
       FROM purchase_orders po
       JOIN projects p ON po.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY po.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...baseParams, limit, offset]
    );

    // Parse JSONB items
    const rows = result.rows.map((r: any) => ({
      ...r,
      items: r.items ? (typeof r.items === 'string' ? JSON.parse(r.items) : r.items) : [],
    }));

    paginatedResponse(res, rows, total, page, limit);
  } catch (err: any) {
    console.error('[PurchaseOrders] List error:', err);
    errorResponse(res, 'Failed to list purchase orders', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get PO by ID ───────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(poIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await query(
      `SELECT po.*, p.name as project_name
       FROM purchase_orders po
       JOIN projects p ON po.project_id = p.id
       WHERE po.id = $1 AND p.user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'Purchase order not found', 'NOT_FOUND', 404);
    }

    const row = result.rows[0];
    row.items = row.items ? (typeof row.items === 'string' ? JSON.parse(row.items) : row.items) : [];

    successResponse(res, row);
  } catch (err: any) {
    console.error('[PurchaseOrders] Get error:', err);
    errorResponse(res, 'Failed to get purchase order', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Purchase Order ────────────────────────────────────────────────
router.post('/', authenticateToken, validate(purchaseOrderSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      projectId, poNumber, title, description, vendorName, vendorEmail, vendorPhone,
      status, items, subtotal, taxRate, taxAmount, total,
      deliveryDate, expectedDelivery, deliveryAddress, notes,
    } = req.body;

    const projectCheck = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) {
      return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
    }

    // Calculate totals if not provided
    const calculatedItems = (items || []).map((it: any) => ({
      ...it,
      totalPrice: it.totalPrice ?? it.quantity * it.unitPrice,
    }));
    const calcSubtotal = subtotal ?? calculatedItems.reduce((s: number, it: any) => s + (it.totalPrice || 0), 0);
    const calcTaxRate = taxRate ?? 0;
    const calcTaxAmount = taxAmount ?? calcSubtotal * (calcTaxRate / 100);
    const calcTotal = total ?? calcSubtotal + calcTaxAmount;

    const poId = uuidv4();

    await query(
      `INSERT INTO purchase_orders
       (id, project_id, po_number, title, description, vendor_name, vendor_email, vendor_phone,
        status, items, subtotal, tax_rate, tax_amount, total,
        delivery_date, expected_delivery, delivery_address, notes, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())`,
      [poId, projectId, poNumber, title, description || null, vendorName,
       vendorEmail || null, vendorPhone || null,
       status || 'draft', JSON.stringify(calculatedItems),
       calcSubtotal, calcTaxRate, calcTaxAmount, calcTotal,
       deliveryDate || null, expectedDelivery || null, deliveryAddress || null,
       notes || null, userId]
    );

    await auditLog({
      eventType: 'po_created',
      userId,
      success: true,
      details: { entityId: poId, projectId, poNumber, title, vendorName, total: calcTotal },
    });

    successResponse(res, { id: poId, message: 'Purchase order created' }, 201);
  } catch (err: any) {
    console.error('[PurchaseOrders] Create error:', err);
    errorResponse(res, 'Failed to create purchase order', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Purchase Order ──────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(poIdSchema), validate(purchaseOrderSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const {
      poNumber, title, description, vendorName, vendorEmail, vendorPhone,
      status, items, subtotal, taxRate, taxAmount, total,
      deliveryDate, expectedDelivery, deliveryAddress, notes,
    } = req.body;

    const accessCheck = await query(
      `SELECT po.id FROM purchase_orders po
       JOIN projects p ON po.project_id = p.id
       WHERE po.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Purchase order not found', 'NOT_FOUND', 404);
    }

    let finalItems: any[] = [];
    let finalSubtotal = 0;
    let finalTaxRate = 0;
    let finalTaxAmount = 0;
    let finalTotal = 0;

    if (items) {
      finalItems = items.map((it: any) => ({
        ...it,
        totalPrice: it.totalPrice ?? it.quantity * it.unitPrice,
      }));
      finalSubtotal = subtotal ?? finalItems.reduce((s: number, it: any) => s + (it.totalPrice || 0), 0);
      finalTaxRate = taxRate ?? 0;
      finalTaxAmount = taxAmount ?? finalSubtotal * (finalTaxRate / 100);
      finalTotal = total ?? finalSubtotal + finalTaxAmount;
    }

    await query(
      `UPDATE purchase_orders SET
        po_number = COALESCE($1, po_number),
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        vendor_name = COALESCE($4, vendor_name),
        vendor_email = COALESCE($5, vendor_email),
        vendor_phone = COALESCE($6, vendor_phone),
        status = COALESCE($7, status),
        items = COALESCE($8, items),
        subtotal = COALESCE($9, subtotal),
        tax_rate = COALESCE($10, tax_rate),
        tax_amount = COALESCE($11, tax_amount),
        total = COALESCE($12, total),
        delivery_date = COALESCE($13, delivery_date),
        expected_delivery = COALESCE($14, expected_delivery),
        delivery_address = COALESCE($15, delivery_address),
        notes = COALESCE($16, notes),
        updated_at = NOW()
       WHERE id = $17`,
      [poNumber, title, description, vendorName, vendorEmail, vendorPhone,
       status, items ? JSON.stringify(finalItems) : null,
       items ? finalSubtotal : null, items ? finalTaxRate : null,
       items ? finalTaxAmount : null, items ? finalTotal : null,
       deliveryDate, expectedDelivery, deliveryAddress, notes, id]
    );

    await auditLog({
      eventType: 'po_updated',
      userId,
      success: true,
      details: { entityId: id, status },
    });

    successResponse(res, { id, message: 'Purchase order updated' });
  } catch (err: any) {
    console.error('[PurchaseOrders] Update error:', err);
    errorResponse(res, 'Failed to update purchase order', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Purchase Order ────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(poIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const accessCheck = await query(
      `SELECT po.id FROM purchase_orders po
       JOIN projects p ON po.project_id = p.id
       WHERE po.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Purchase order not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM purchase_orders WHERE id = $1', [id]);

    await auditLog({
      eventType: 'po_deleted',
      userId,
      success: true,
      details: { entityId: id },
    });

    successResponse(res, { message: 'Purchase order deleted' });
  } catch (err: any) {
    console.error('[PurchaseOrders] Delete error:', err);
    errorResponse(res, 'Failed to delete purchase order', 'INTERNAL_ERROR', 500);
  }
});

export { router as purchaseOrdersRouter };
