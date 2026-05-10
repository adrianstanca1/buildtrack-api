import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';
import { auditLog } from '../utils/audit.js';

const router = Router();

const equipmentSchema = z.object({
  projectId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  type: z.enum(['excavator', 'bulldozer', 'crane', 'loader', 'dump_truck', 'mixer', 'generator', 'scaffold', 'scissor_lift', 'forklift', 'compactor', 'other']).optional(),
  make: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
  status: z.enum(['available', 'rented', 'on_site', 'under_maintenance', 'out_of_service', 'retired']).optional(),
  dailyRate: z.number().min(0).optional(),
  purchasePrice: z.number().min(0).optional(),
  purchaseDate: z.string().max(20).optional(),
  insuranceExpiry: z.string().max(20).optional(),
  motExpiry: z.string().max(20).optional(),
  location: z.string().max(255).optional(),
  notes: z.string().optional(),
});

const maintenanceSchema = z.object({
  equipmentId: z.string().uuid(),
  maintenanceType: z.enum(['routine', 'repair', 'inspection', 'calibration', 'replacement']).optional(),
  description: z.string().min(1),
  cost: z.number().min(0).optional(),
  performedBy: z.string().max(255).optional(),
  performedAt: z.string().max(50).optional(),
  nextDue: z.string().max(20).optional(),
});

const equipmentIdSchema = z.object({ id: z.string().uuid() });

// ─── List Equipment ─────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const projectId = req.query.projectId as string;
    const status = req.query.status as string;
    const type = req.query.type as string;

    let baseWhere = 'e.user_id = $1';
    const baseParams: any[] = [userId];
    let idx = 2;

    if (projectId) { baseWhere += ` AND e.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)    { baseWhere += ` AND e.status = $${idx++}`;    baseParams.push(status); }
    if (type)      { baseWhere += ` AND e.type = $${idx++}`;     baseParams.push(type); }

    const countResult = await query(
      `SELECT COUNT(*) FROM equipment e WHERE ${baseWhere}`,
      baseParams
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT e.*,
        p.name as project_name,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', m.id,
            'maintenanceType', m.maintenance_type,
            'description', m.description,
            'cost', m.cost,
            'performedBy', m.performed_by,
            'performedAt', m.performed_at,
            'nextDue', m.next_due,
            'createdAt', m.created_at
          ) ORDER BY m.performed_at DESC NULLS LAST, m.created_at DESC)
          FROM equipment_maintenance m WHERE m.equipment_id = e.id), '[]'
        ) as maintenance_history
       FROM equipment e
       LEFT JOIN projects p ON e.project_id = p.id
       WHERE ${baseWhere}
       GROUP BY e.id, p.name
       ORDER BY e.updated_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...baseParams, limit, offset]
    );

    const rows = result.rows.map((r: any) => ({
      ...r,
      maintenance_history: r.maintenance_history ? (typeof r.maintenance_history === 'string' ? JSON.parse(r.maintenance_history) : r.maintenance_history) : [],
    }));

    paginatedResponse(res, rows, total, page, limit);
  } catch (err: any) {
    console.error('[Equipment] List error:', err);
    errorResponse(res, 'Failed to list equipment', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get Equipment by ID ──────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(equipmentIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await query(
      `SELECT e.*, p.name as project_name,
        COALESCE(
          (SELECT json_agg(json_build_object(
            'id', m.id, 'maintenanceType', m.maintenance_type, 'description', m.description,
            'cost', m.cost, 'performedBy', m.performed_by, 'performedAt', m.performed_at,
            'nextDue', m.next_due, 'createdAt', m.created_at
          ) ORDER BY m.performed_at DESC NULLS LAST, m.created_at DESC)
          FROM equipment_maintenance m WHERE m.equipment_id = e.id), '[]'
        ) as maintenance_history
       FROM equipment e
       LEFT JOIN projects p ON e.project_id = p.id
       WHERE e.id = $1 AND e.user_id = $2
       GROUP BY e.id, p.name`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'Equipment not found', 'NOT_FOUND', 404);
    }

    const row = result.rows[0];
    row.maintenance_history = row.maintenance_history ? (typeof row.maintenance_history === 'string' ? JSON.parse(row.maintenance_history) : row.maintenance_history) : [];

    successResponse(res, row);
  } catch (err: any) {
    console.error('[Equipment] Get error:', err);
    errorResponse(res, 'Failed to get equipment', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Equipment ───────────────────────────────────────────────────
router.post('/', authenticateToken, validate(equipmentSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      projectId, name, type, make, model, serialNumber, year,
      status, dailyRate, purchasePrice, purchaseDate,
      insuranceExpiry, motExpiry, location, notes,
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

    const equipmentId = uuidv4();

    await query(
      `INSERT INTO equipment
       (id, user_id, project_id, name, type, make, model, serial_number, year,
        status, daily_rate, purchase_price, purchase_date,
        insurance_expiry, mot_expiry, location, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW(),NOW())`,
      [equipmentId, userId, projectId || null, name, type || 'other', make || null, model || null,
       serialNumber || null, year || null, status || 'available', dailyRate || null,
       purchasePrice || null, purchaseDate || null, insuranceExpiry || null, motExpiry || null,
       location || null, notes || null]
    );

    await auditLog({
      eventType: 'equipment_created',
      userId,
      success: true,
      details: { entityId: equipmentId, projectId, name, type },
    });

    successResponse(res, { id: equipmentId, message: 'Equipment created' }, 201);
  } catch (err: any) {
    console.error('[Equipment] Create error:', err);
    errorResponse(res, 'Failed to create equipment', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Equipment ───────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(equipmentIdSchema), validate(equipmentSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const {
      projectId, name, type, make, model, serialNumber, year,
      status, dailyRate, purchasePrice, purchaseDate,
      insuranceExpiry, motExpiry, location, notes,
    } = req.body;

    const accessCheck = await query(
      'SELECT id FROM equipment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Equipment not found', 'NOT_FOUND', 404);
    }

    await query(
      `UPDATE equipment SET
        project_id = COALESCE($1, project_id),
        name = COALESCE($2, name),
        type = COALESCE($3, type),
        make = COALESCE($4, make),
        model = COALESCE($5, model),
        serial_number = COALESCE($6, serial_number),
        year = COALESCE($7, year),
        status = COALESCE($8, status),
        daily_rate = COALESCE($9, daily_rate),
        purchase_price = COALESCE($10, purchase_price),
        purchase_date = COALESCE($11, purchase_date),
        insurance_expiry = COALESCE($12, insurance_expiry),
        mot_expiry = COALESCE($13, mot_expiry),
        location = COALESCE($14, location),
        notes = COALESCE($15, notes),
        updated_at = NOW()
       WHERE id = $16`,
      [projectId, name, type, make, model, serialNumber, year, status,
       dailyRate, purchasePrice, purchaseDate, insuranceExpiry, motExpiry,
       location, notes, id]
    );

    await auditLog({
      eventType: 'equipment_updated',
      userId,
      success: true,
      details: { entityId: id, status },
    });

    successResponse(res, { id, message: 'Equipment updated' });
  } catch (err: any) {
    console.error('[Equipment] Update error:', err);
    errorResponse(res, 'Failed to update equipment', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Equipment ───────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(equipmentIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const accessCheck = await query(
      'SELECT id FROM equipment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Equipment not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM equipment_maintenance WHERE equipment_id = $1', [id]);
    await query('DELETE FROM equipment WHERE id = $1', [id]);

    await auditLog({
      eventType: 'equipment_deleted',
      userId,
      success: true,
      details: { entityId: id },
    });

    successResponse(res, { message: 'Equipment deleted' });
  } catch (err: any) {
    console.error('[Equipment] Delete error:', err);
    errorResponse(res, 'Failed to delete equipment', 'INTERNAL_ERROR', 500);
  }
});

// ─── Add Maintenance Record ───────────────────────────────────────────────
router.post('/:id/maintenance', authenticateToken, validateParams(equipmentIdSchema), validate(maintenanceSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { maintenanceType, description, cost, performedBy, performedAt, nextDue } = req.body;

    const accessCheck = await query(
      'SELECT id FROM equipment WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Equipment not found', 'NOT_FOUND', 404);
    }

    const maintenanceId = uuidv4();
    await query(
      `INSERT INTO equipment_maintenance
       (id, equipment_id, maintenance_type, description, cost,
        performed_by, performed_at, next_due, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [maintenanceId, id, maintenanceType || 'routine', description, cost || null,
       performedBy || null, performedAt || null, nextDue || null]
    );

    successResponse(res, { id: maintenanceId, message: 'Maintenance record added' }, 201);
  } catch (err: any) {
    console.error('[Equipment] Maintenance error:', err);
    errorResponse(res, 'Failed to add maintenance record', 'INTERNAL_ERROR', 500);
  }
});

export { router as equipmentRouter };
