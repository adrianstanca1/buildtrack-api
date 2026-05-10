import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { paginatedResponse, successResponse } from '../utils/response.js';
import { auditLog } from '../utils/audit.js';

const router = Router();

const scheduleSchema = z.object({
  projectId: z.string().uuid().optional(),
  projectName: z.string().optional(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  durationDays: z.number().int().min(0).optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  status: z.enum(['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled']).optional(),
  isMilestone: z.boolean().optional(),
  isCriticalPath: z.boolean().optional(),
  wbsCode: z.string().optional(),
  parentTaskId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  assignedName: z.string().optional(),
  predecessorIds: z.array(z.string().uuid()).optional(),
  lagDays: z.number().int().optional(),
  floatDays: z.number().int().optional(),
  resourceIds: z.array(z.string().uuid()).optional(),
  costEstimate: z.number().min(0).optional(),
  actualCost: z.number().min(0).optional(),
});

const updateSchema = scheduleSchema.partial();

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { projectId, status, isMilestone, search, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    let sql = 'SELECT * FROM schedules WHERE 1=1';
    let countSql = 'SELECT COUNT(*) FROM schedules WHERE 1=1';
    const params: any[] = [];

    if (projectId) { params.push(projectId); sql += ` AND project_id = $${params.length}`; countSql += ` AND project_id = $${params.length}`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; countSql += ` AND status = $${params.length}`; }
    if (isMilestone !== undefined) { params.push(isMilestone === 'true'); sql += ` AND is_milestone = $${params.length}`; countSql += ` AND is_milestone = $${params.length}`; }
    if (search) { params.push(`%${search}%`); sql += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length} OR wbs_code ILIKE $${params.length})`; countSql += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length} OR wbs_code ILIKE $${params.length})`; }

    sql += ' ORDER BY start_date ASC, wbs_code ASC NULLS LAST';
    params.push(limitNum, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows: items } = await query(sql, params);
    const { rows: countRows } = await query(countSql, params.slice(0, -2));
    const total = parseInt(countRows[0].count);

    return paginatedResponse(res, items, total, pageNum, limitNum);
  } catch (err) { next(err); }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
    return successResponse(res, rows[0]);
  } catch (err) { next(err); }
});

router.post('/', authenticateToken, validate(scheduleSchema), async (req, res, next) => {
  try {
    const d = req.body;
    const id = uuidv4();
    const { rows } = await query(
      `INSERT INTO schedules (id, project_id, project_name, name, description, start_date, end_date, duration_days, progress_percent, status,
       is_milestone, is_critical_path, wbs_code, parent_task_id, assigned_to, assigned_name, predecessor_ids, lag_days, float_days, resource_ids, cost_estimate, actual_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [id, d.projectId||null, d.projectName||null, d.name, d.description||null, d.startDate, d.endDate||null,
       d.durationDays||null, d.progressPercent||0, d.status||'not_started', d.isMilestone||false, d.isCriticalPath||false,
       d.wbsCode||null, d.parentTaskId||null, d.assignedTo||null, d.assignedName||null,
       d.predecessorIds||null, d.lagDays||0, d.floatDays||null, d.resourceIds||null,
       d.costEstimate||null, d.actualCost||null]
    );
    await auditLog({ eventType:'schedule_task_created', userId: (req as any).user?.id, success: true, details: { scheduleId: id } });
    return successResponse(res, rows[0], 201);
  } catch (err) { next(err); }
});

router.patch('/:id', authenticateToken, validate(updateSchema), async (req, res, next) => {
  try {
    const d = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    const add = (col: string, val: any) => { if (val !== undefined) { fields.push(`${col} = $${fields.length + 2}`); values.push(val); } };

    add('project_id', d.projectId);
    add('project_name', d.projectName);
    add('name', d.name);
    add('description', d.description);
    add('start_date', d.startDate);
    add('end_date', d.endDate);
    add('duration_days', d.durationDays);
    add('progress_percent', d.progressPercent);
    add('status', d.status);
    add('is_milestone', d.isMilestone);
    add('is_critical_path', d.isCriticalPath);
    add('wbs_code', d.wbsCode);
    add('parent_task_id', d.parentTaskId);
    add('assigned_to', d.assignedTo);
    add('assigned_name', d.assignedName);
    add('predecessor_ids', d.predecessorIds);
    add('lag_days', d.lagDays);
    add('float_days', d.floatDays);
    add('resource_ids', d.resourceIds);
    add('cost_estimate', d.costEstimate);
    add('actual_cost', d.actualCost);

    if (fields.length === 0) return res.status(400).json({ success: false, error: { message: 'No fields', code: 'BAD_REQUEST' } });
    const { rows } = await query(`UPDATE schedules SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id, ...values]);
    await auditLog({ eventType:'schedule_task_updated', userId: (req as any).user?.id, success: true, details: { scheduleId: req.params.id } });
    return successResponse(res, rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM schedules WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
    await auditLog({ eventType:'schedule_task_deleted', userId: (req as any).user?.id, success: true, details: { scheduleId: req.params.id } });
    return successResponse(res, null);
  } catch (err) { next(err); }
});

export { router as schedulesRouter };
