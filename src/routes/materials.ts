import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';
import { auditLog } from '../utils/audit.js';

const router = Router();

const materialSchema = z.object({
  projectId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  category: z.enum(['concrete', 'steel', 'timber', 'brick', 'block', 'insulation', 'roofing', 'electrical', 'plumbing', 'paint', 'hardware', 'aggregate', 'other']).optional(),
  unit: z.string().min(1).max(50),
  unitCost: z.number().min(0).optional(),
  quantityOnHand: z.number().min(0).optional(),
  quantityOrdered: z.number().min(0).optional(),
  reorderLevel: z.number().min(0).optional(),
  reorderQuantity: z.number().min(0).optional(),
  supplierName: z.string().max(255).optional(),
  location: z.string().max(255).optional(),
  notes: z.string().optional(),
});

const deliverySchema = z.object({
  materialId: z.string().uuid(),
  poId: z.string().uuid().optional(),
  quantity: z.number().min(0.01),
  unitCost: z.number().min(0).optional(),
  deliveryDate: z.string().max(20).optional(),
  deliveredBy: z.string().max(255).optional(),
  notes: z.string().optional(),
});

const usageSchema = z.object({
  materialId: z.string().uuid(),
  quantity: z.number().min(0.01),
  usedBy: z.string().uuid().optional(),
  usedDate: z.string().max(20).optional(),
  workArea: z.string().max(255).optional(),
  notes: z.string().optional(),
});

const materialIdSchema = z.object({ id: z.string().uuid() });

// ─── List Materials ──────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const projectId = req.query.projectId as string;
    const category = req.query.category as string;
    const lowStock = req.query.lowStock === 'true';

    let baseWhere = 'p.user_id = $1';
    const baseParams: any[] = [userId];
    let idx = 2;

    if (projectId) { baseWhere += ` AND m.project_id = $${idx++}`; baseParams.push(projectId); }
    if (category)    { baseWhere += ` AND m.category = $${idx++}`; baseParams.push(category); }
    if (lowStock)    { baseWhere += ` AND m.quantity_on_hand <= COALESCE(m.reorder_level, 0)`; }

    const countResult = await query(
      `SELECT COUNT(*) FROM materials m
       LEFT JOIN projects p ON m.project_id = p.id
       WHERE ${baseWhere}`,
      baseParams
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT m.*, p.name as project_name
       FROM materials m
       LEFT JOIN projects p ON m.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY m.updated_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...baseParams, limit, offset]
    );

    paginatedResponse(res, result.rows, total, page, limit);
  } catch (err: any) {
    console.error('[Materials] List error:', err);
    errorResponse(res, 'Failed to list materials', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get Material by ID ─────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(materialIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await query(
      `SELECT m.*, p.name as project_name
       FROM materials m
       LEFT JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1 AND (p.user_id = $2 OR m.project_id IS NULL)`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'Material not found', 'NOT_FOUND', 404);
    }

    const material = result.rows[0];

    // Get deliveries
    const deliveries = await query(
      `SELECT d.*, po.po_number
       FROM material_deliveries d
       LEFT JOIN purchase_orders po ON d.po_id = po.id
       WHERE d.material_id = $1
       ORDER BY d.delivery_date DESC NULLS LAST, d.created_at DESC`,
      [id]
    );
    material.deliveries = deliveries.rows;

    // Get usage
    const usage = await query(
      `SELECT u.*, w.name as used_by_name
       FROM material_usage u
       LEFT JOIN workers w ON u.used_by = w.id
       WHERE u.material_id = $1
       ORDER BY u.used_date DESC NULLS LAST, u.created_at DESC`,
      [id]
    );
    material.usage = usage.rows;

    successResponse(res, material);
  } catch (err: any) {
    console.error('[Materials] Get error:', err);
    errorResponse(res, 'Failed to get material', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Material ──────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(materialSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      projectId, name, category, unit, unitCost, quantityOnHand,
      quantityOrdered, reorderLevel, reorderQuantity, supplierName, location, notes,
    } = req.body;

    if (projectId) {
      const projectCheck = await query(
        'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
        [projectId, userId]
      );
      if (projectCheck.rows.length === 0) {
        return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
      }
    }

    const materialId = uuidv4();

    await query(
      `INSERT INTO materials
       (id, project_id, name, category, unit, unit_cost, quantity_on_hand,
        quantity_ordered, reorder_level, reorder_quantity, supplier_name,
        location, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())`,
      [materialId, projectId || null, name, category || 'other', unit,
       unitCost || 0, quantityOnHand || 0, quantityOrdered || 0,
       reorderLevel || 0, reorderQuantity || 0, supplierName || null,
       location || null, notes || null]
    );

    await auditLog({
      eventType: 'material_created',
      userId,
      success: true,
      details: { entityId: materialId, projectId, name, category },
    });

    successResponse(res, { id: materialId, message: 'Material created' }, 201);
  } catch (err: any) {
    console.error('[Materials] Create error:', err);
    errorResponse(res, 'Failed to create material', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Material ───────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(materialIdSchema), validate(materialSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const {
      projectId, name, category, unit, unitCost, quantityOnHand,
      quantityOrdered, reorderLevel, reorderQuantity, supplierName, location, notes,
    } = req.body;

    const accessCheck = await query(
      `SELECT m.id FROM materials m
       LEFT JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1 AND (p.user_id = $2 OR m.project_id IS NULL)`,
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Material not found', 'NOT_FOUND', 404);
    }

    await query(
      `UPDATE materials SET
        project_id = COALESCE($1, project_id),
        name = COALESCE($2, name),
        category = COALESCE($3, category),
        unit = COALESCE($4, unit),
        unit_cost = COALESCE($5, unit_cost),
        quantity_on_hand = COALESCE($6, quantity_on_hand),
        quantity_ordered = COALESCE($7, quantity_ordered),
        reorder_level = COALESCE($8, reorder_level),
        reorder_quantity = COALESCE($9, reorder_quantity),
        supplier_name = COALESCE($10, supplier_name),
        location = COALESCE($11, location),
        notes = COALESCE($12, notes),
        updated_at = NOW()
       WHERE id = $13`,
      [projectId, name, category, unit, unitCost, quantityOnHand,
       quantityOrdered, reorderLevel, reorderQuantity, supplierName, location, notes, id]
    );

    await auditLog({
      eventType: 'material_updated',
      userId,
      success: true,
      details: { entityId: id },
    });

    successResponse(res, { id, message: 'Material updated' });
  } catch (err: any) {
    console.error('[Materials] Update error:', err);
    errorResponse(res, 'Failed to update material', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Material ────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(materialIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const accessCheck = await query(
      `SELECT m.id FROM materials m
       LEFT JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1 AND (p.user_id = $2 OR m.project_id IS NULL)`,
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Material not found', 'NOT_FOUND', 404);
    }

    await transaction(async (client) => {
      await client.query('DELETE FROM material_usage WHERE material_id = $1', [id]);
      await client.query('DELETE FROM material_deliveries WHERE material_id = $1', [id]);
      await client.query('DELETE FROM materials WHERE id = $1', [id]);
    });

    await auditLog({
      eventType: 'material_deleted',
      userId,
      success: true,
      details: { entityId: id },
    });

    successResponse(res, { message: 'Material deleted' });
  } catch (err: any) {
    console.error('[Materials] Delete error:', err);
    errorResponse(res, 'Failed to delete material', 'INTERNAL_ERROR', 500);
  }
});

// ─── Record Delivery ─────────────────────────────────────────────────────
router.post('/:id/deliveries', authenticateToken, validateParams(materialIdSchema), validate(deliverySchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { poId, quantity, unitCost, deliveryDate, deliveredBy, notes } = req.body;

    const accessCheck = await query(
      `SELECT m.id, m.quantity_on_hand, m.quantity_ordered FROM materials m
       LEFT JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1 AND (p.user_id = $2 OR m.project_id IS NULL)`,
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Material not found', 'NOT_FOUND', 404);
    }

    const material = accessCheck.rows[0];
    const deliveryId = uuidv4();

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO material_deliveries
         (id, material_id, po_id, quantity, unit_cost, delivery_date, delivered_by, notes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [deliveryId, id, poId || null, quantity, unitCost || null,
         deliveryDate || null, deliveredBy || null, notes || null]
      );

      await client.query(
        `UPDATE materials SET
          quantity_on_hand = quantity_on_hand + $1,
          quantity_ordered = GREATEST(0, quantity_ordered - $1),
          updated_at = NOW()
         WHERE id = $2`,
        [quantity, id]
      );
    });

    successResponse(res, { id: deliveryId, message: 'Delivery recorded', newStock: material.quantity_on_hand + quantity }, 201);
  } catch (err: any) {
    console.error('[Materials] Delivery error:', err);
    errorResponse(res, 'Failed to record delivery', 'INTERNAL_ERROR', 500);
  }
});

// ─── Record Usage ─────────────────────────────────────────────────────────
router.post('/:id/usage', authenticateToken, validateParams(materialIdSchema), validate(usageSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { quantity, usedBy, usedDate, workArea, notes } = req.body;

    const accessCheck = await query(
      `SELECT m.id, m.quantity_on_hand FROM materials m
       LEFT JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1 AND (p.user_id = $2 OR m.project_id IS NULL)`,
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Material not found', 'NOT_FOUND', 404);
    }

    const material = accessCheck.rows[0];
    if (material.quantity_on_hand < quantity) {
      return errorResponse(res, 'Insufficient stock', 'INSUFFICIENT_STOCK', 400);
    }

    const usageId = uuidv4();

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO material_usage
         (id, material_id, quantity, used_by, used_date, work_area, notes, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
        [usageId, id, quantity, usedBy || null, usedDate || null,
         workArea || null, notes || null]
      );

      await client.query(
        'UPDATE materials SET quantity_on_hand = quantity_on_hand - $1, updated_at = NOW() WHERE id = $2',
        [quantity, id]
      );
    });

    successResponse(res, { id: usageId, message: 'Usage recorded', remaining: material.quantity_on_hand - quantity }, 201);
  } catch (err: any) {
    console.error('[Materials] Usage error:', err);
    errorResponse(res, 'Failed to record usage', 'INTERNAL_ERROR', 500);
  }
});

export { router as materialsRouter };
