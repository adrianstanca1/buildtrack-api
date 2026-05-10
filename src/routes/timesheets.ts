import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, pool } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';

const router = Router();

const timesheetSchema = z.object({
  projectId: z.string().uuid().optional(),
  projectName: z.string().min(1).max(255),
  workerId: z.string().optional(),
  workerName: z.string().min(1).max(255),
  weekStarting: z.string().min(1).max(20),
  mondayHours: z.number().min(0).optional(),
  tuesdayHours: z.number().min(0).optional(),
  wednesdayHours: z.number().min(0).optional(),
  thursdayHours: z.number().min(0).optional(),
  fridayHours: z.number().min(0).optional(),
  saturdayHours: z.number().min(0).optional(),
  sundayHours: z.number().min(0).optional(),
  totalHours: z.number().min(0).optional(),
  overtimeHours: z.number().min(0).optional(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected']).optional(),
  notes: z.string().optional(),
});

const timesheetIdSchema = z.object({ id: z.string().uuid() });

// ─── List Timesheets ────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const projectId = req.query.projectId as string;
    const status = req.query.status as string;
    const workerId = req.query.workerId as string;

    let baseWhere = 'p.user_id = $1';
    const baseParams: any[] = [userId];
    let idx = 2;

    if (projectId) { baseWhere += ` AND t.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)     { baseWhere += ` AND t.status = $${idx++}`;     baseParams.push(status); }
    if (workerId)   { baseWhere += ` AND t.worker_id = $${idx++}`;  baseParams.push(workerId); }

    const countResult = await query(
      `SELECT COUNT(*) FROM timesheets t JOIN projects p ON t.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT t.*, p.name as project_name FROM timesheets t
       JOIN projects p ON t.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY t.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[Timesheets] List error:', err);
    errorResponse(res, 'Failed to fetch timesheets', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Timesheet ───────────────────────────────────────────────────
router.post('/', authenticateToken, validate(timesheetSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      projectId, projectName, workerId, workerName, weekStarting,
      mondayHours, tuesdayHours, wednesdayHours, thursdayHours, fridayHours,
      saturdayHours, sundayHours, totalHours, overtimeHours, status, notes,
    } = req.body;
    const userId = req.user!.id;

    if (projectId) {
      const projectCheck = await client.query(
        'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
        [projectId, userId]
      );
      if (projectCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
      }
    }

    const id = uuidv4();
    const result = await client.query(
      `INSERT INTO timesheets (id, project_id, project_name, worker_id, worker_name, week_starting,
       monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours,
       saturday_hours, sunday_hours, total_hours, overtime_hours, status, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()) RETURNING *`,
      [id, projectId || null, projectName, workerId || null, workerName, weekStarting,
       mondayHours || 0, tuesdayHours || 0, wednesdayHours || 0, thursdayHours || 0, fridayHours || 0,
       saturdayHours || 0, sundayHours || 0, totalHours || 0, overtimeHours || 0, status || 'draft', notes || null]
    );

    await client.query('COMMIT');
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Timesheets] Create error:', err);
    errorResponse(res, 'Failed to create timesheet', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

// ─── Get Timesheet ───────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(timesheetIdSchema), async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, p.name as project_name FROM timesheets t
       JOIN projects p ON t.project_id = p.id
       WHERE t.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return errorResponse(res, 'Timesheet not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Timesheets] Get error:', err);
    errorResponse(res, 'Failed to fetch timesheet', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Timesheet ──────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(timesheetIdSchema), validate(timesheetSchema.partial()), async (req, res) => {
  try {
    const timesheetId = req.params.id;
    const userId = req.user!.id;

    const check = await query(
      `SELECT t.id FROM timesheets t JOIN projects p ON t.project_id = p.id WHERE t.id = $1 AND p.user_id = $2`,
      [timesheetId, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Timesheet not found', 'NOT_FOUND', 404);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const mappings: Record<string, string> = {
      projectId: 'project_id',
      projectName: 'project_name',
      workerId: 'worker_id',
      workerName: 'worker_name',
      weekStarting: 'week_starting',
      mondayHours: 'monday_hours',
      tuesdayHours: 'tuesday_hours',
      wednesdayHours: 'wednesday_hours',
      thursdayHours: 'thursday_hours',
      fridayHours: 'friday_hours',
      saturdayHours: 'saturday_hours',
      sundayHours: 'sunday_hours',
      totalHours: 'total_hours',
      overtimeHours: 'overtime_hours',
      status: 'status',
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

    values.push(timesheetId);
    const sql = `UPDATE timesheets SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Timesheets] Update error:', err);
    errorResponse(res, 'Failed to update timesheet', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Timesheet ──────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(timesheetIdSchema), async (req, res) => {
  try {
    const check = await query(
      `SELECT t.id FROM timesheets t JOIN projects p ON t.project_id = p.id WHERE t.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Timesheet not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM timesheets WHERE id = $1', [req.params.id]);
    successResponse(res, { message: 'Timesheet deleted' });
  } catch (err) {
    console.error('[Timesheets] Delete error:', err);
    errorResponse(res, 'Failed to delete timesheet', 'INTERNAL_ERROR', 500);
  }
});

export { router as timesheetsRouter };
