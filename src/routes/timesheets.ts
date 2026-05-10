import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';
import { auditLog } from '../utils/audit.js';

const router = Router();

const timesheetEntrySchema = z.object({
  projectId: z.string().uuid().min(1),
  workerId: z.string().uuid().min(1),
  entryDate: z.string().max(20),
  hoursWorked: z.number().min(0).max(24),
  overtimeHours: z.number().min(0).max(24).optional(),
  hourlyRate: z.number().min(0).optional(),
  overtimeRate: z.number().min(0).optional(),
  workDescription: z.string().max(500).optional(),
  category: z.enum(['regular', 'overtime', 'weekend', 'holiday', 'sick', 'leave']).optional(),
  status: z.enum(['submitted', 'approved', 'rejected', 'paid']).optional(),
  approvedBy: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const entryIdSchema = z.object({ id: z.string().uuid() });

// ─── List Timesheet Entries ───────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const projectId = req.query.projectId as string;
    const workerId = req.query.workerId as string;
    const status = req.query.status as string;
    const entryDate = req.query.entryDate as string;

    let baseWhere = 'p.user_id = $1';
    const baseParams: any[] = [userId];
    let idx = 2;

    if (projectId) { baseWhere += ` AND t.project_id = $${idx++}`; baseParams.push(projectId); }
    if (workerId)  { baseWhere += ` AND t.worker_id = $${idx++}`; baseParams.push(workerId); }
    if (status)      { baseWhere += ` AND t.status = $${idx++}`;    baseParams.push(status); }
    if (entryDate)   { baseWhere += ` AND t.entry_date = $${idx++}`; baseParams.push(entryDate); }

    const countResult = await query(
      `SELECT COUNT(*) FROM timesheet_entries t
       JOIN projects p ON t.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT t.*,
        p.name as project_name,
        w.name as worker_name,
        w.role as worker_role,
        (t.hours_worked * COALESCE(t.hourly_rate, w.hourly_rate, 0) +
         t.overtime_hours * COALESCE(t.overtime_rate, w.hourly_rate * 1.5, 0)) as total_pay
       FROM timesheet_entries t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN workers w ON t.worker_id = w.id
       WHERE ${baseWhere}
       ORDER BY t.entry_date DESC, t.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...baseParams, limit, offset]
    );

    paginatedResponse(res, result.rows, total, page, limit);
  } catch (err: any) {
    console.error('[Timesheets] List error:', err);
    errorResponse(res, 'Failed to list timesheet entries', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get Entry by ID ────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(entryIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await query(
      `SELECT t.*,
        p.name as project_name,
        w.name as worker_name,
        w.role as worker_role,
        (t.hours_worked * COALESCE(t.hourly_rate, w.hourly_rate, 0) +
         t.overtime_hours * COALESCE(t.overtime_rate, w.hourly_rate * 1.5, 0)) as total_pay
       FROM timesheet_entries t
       JOIN projects p ON t.project_id = p.id
       LEFT JOIN workers w ON t.worker_id = w.id
       WHERE t.id = $1 AND p.user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'Timesheet entry not found', 'NOT_FOUND', 404);
    }

    successResponse(res, result.rows[0]);
  } catch (err: any) {
    console.error('[Timesheets] Get error:', err);
    errorResponse(res, 'Failed to get timesheet entry', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Entry ───────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(timesheetEntrySchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      projectId, workerId, entryDate, hoursWorked, overtimeHours,
      hourlyRate, overtimeRate, workDescription, category, status, notes,
    } = req.body;

    const projectCheck = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) {
      return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
    }

    const entryId = uuidv4();

    await query(
      `INSERT INTO timesheet_entries
       (id, project_id, worker_id, entry_date, hours_worked, overtime_hours,
        hourly_rate, overtime_rate, work_description, category, status,
        notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
      [entryId, projectId, workerId, entryDate, hoursWorked, overtimeHours || 0,
       hourlyRate || null, overtimeRate || null, workDescription || null,
       category || 'regular', status || 'submitted', notes || null]
    );

    await auditLog({
      eventType: 'timesheet_created',
      userId,
      success: true,
      details: { entityId: entryId, projectId, workerId, hoursWorked },
    });

    successResponse(res, { id: entryId, message: 'Timesheet entry created' }, 201);
  } catch (err: any) {
    console.error('[Timesheets] Create error:', err);
    errorResponse(res, 'Failed to create timesheet entry', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Entry ───────────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(entryIdSchema), validate(timesheetEntrySchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const {
      hoursWorked, overtimeHours, hourlyRate, overtimeRate,
      workDescription, category, status, approvedBy, notes,
    } = req.body;

    const accessCheck = await query(
      `SELECT t.id FROM timesheet_entries t
       JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Timesheet entry not found', 'NOT_FOUND', 404);
    }

    await query(
      `UPDATE timesheet_entries SET
        hours_worked = COALESCE($1, hours_worked),
        overtime_hours = COALESCE($2, overtime_hours),
        hourly_rate = COALESCE($3, hourly_rate),
        overtime_rate = COALESCE($4, overtime_rate),
        work_description = COALESCE($5, work_description),
        category = COALESCE($6, category),
        status = COALESCE($7, status),
        approved_by = COALESCE($8, approved_by),
        notes = COALESCE($9, notes),
        updated_at = NOW()
       WHERE id = $10`,
      [hoursWorked, overtimeHours, hourlyRate, overtimeRate,
       workDescription, category, status, approvedBy, notes, id]
    );

    await auditLog({
      eventType: 'timesheet_updated',
      userId,
      success: true,
      details: { entityId: id, status },
    });

    successResponse(res, { id, message: 'Timesheet entry updated' });
  } catch (err: any) {
    console.error('[Timesheets] Update error:', err);
    errorResponse(res, 'Failed to update timesheet entry', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Entry ───────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(entryIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const accessCheck = await query(
      `SELECT t.id FROM timesheet_entries t
       JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Timesheet entry not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM timesheet_entries WHERE id = $1', [id]);

    await auditLog({
      eventType: 'timesheet_deleted',
      userId,
      success: true,
      details: { entityId: id },
    });

    successResponse(res, { message: 'Timesheet entry deleted' });
  } catch (err: any) {
    console.error('[Timesheets] Delete error:', err);
    errorResponse(res, 'Failed to delete timesheet entry', 'INTERNAL_ERROR', 500);
  }
});

// ─── Batch Approve ──────────────────────────────────────────────────────
router.post('/batch-approve', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { entryIds } = req.body;

    if (!Array.isArray(entryIds) || entryIds.length === 0) {
      return errorResponse(res, 'entryIds array required', 'VALIDATION_ERROR', 400);
    }

    const placeholders = entryIds.map((_: any, i: number) => `$${i + 3}`).join(',');
    await query(
      `UPDATE timesheet_entries t SET status = 'approved', approved_by = $1, updated_at = NOW()
       FROM projects p
       WHERE t.project_id = p.id AND p.user_id = $2 AND t.id IN (${placeholders})`,
      [userId, userId, ...entryIds]
    );

    await auditLog({
      eventType: 'timesheet_batch_approved',
      userId,
      success: true,
      details: { count: entryIds.length, entryIds },
    });

    successResponse(res, { message: `${entryIds.length} entries approved` });
  } catch (err: any) {
    console.error('[Timesheets] Batch approve error:', err);
    errorResponse(res, 'Failed to approve entries', 'INTERNAL_ERROR', 500);
  }
});

export { router as timesheetsRouter };
