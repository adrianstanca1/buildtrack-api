import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, pool } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';

const router = Router();

const dailyReportSchema = z.object({
  projectId: z.string().uuid().min(1),
  reportDate: z.string().datetime(),
  weather: z.string().optional(),
  temperature: z.number().optional(),
  workersOnSite: z.number().min(0).optional(),
  workCompleted: z.string().optional(),
  materialsUsed: z.string().optional(),
  equipmentUsed: z.string().optional(),
  issuesDelays: z.string().optional(),
  safetyObservations: z.string().optional(),
  nextDayPlan: z.string().optional(),
  photoUrls: z.string().optional(),
  submittedBy: z.string().min(1),
  status: z.enum(['draft', 'submitted', 'approved']).optional(),
});

const dailyReportIdSchema = z.object({ id: z.string().uuid() });

// ─── List Daily Reports ─────────────────────────────────────────────────
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

    if (projectId) { baseWhere += ` AND dr.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)     { baseWhere += ` AND dr.status = $${idx++}`;     baseParams.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) FROM daily_reports dr JOIN projects p ON dr.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT dr.*, p.name as project_name FROM daily_reports dr
       JOIN projects p ON dr.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY dr.report_date DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[DailyReports] List error:', err);
    errorResponse(res, 'Failed to fetch daily reports', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Daily Report ────────────────────────────────────────────────
router.post('/', authenticateToken, validate(dailyReportSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      projectId, reportDate, weather, temperature, workersOnSite, workCompleted,
      materialsUsed, equipmentUsed, issuesDelays, safetyObservations,
      nextDayPlan, photoUrls, submittedBy, status,
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
      `INSERT INTO daily_reports (
        id, project_id, report_date, weather, temperature, workers_on_site,
        work_completed, materials_used, equipment_used, issues_delays,
        safety_observations, next_day_plan, photo_urls, submitted_by, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()) RETURNING *`,
      [id, projectId, reportDate, weather || null, temperature || null, workersOnSite || 0,
       workCompleted || null, materialsUsed || null, equipmentUsed || null, issuesDelays || null,
       safetyObservations || null, nextDayPlan || null, photoUrls || null, submittedBy,
       status || 'draft']
    );

    await client.query('COMMIT');
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DailyReports] Create error:', err);
    errorResponse(res, 'Failed to create daily report', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

// ─── Get Daily Report ───────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(dailyReportIdSchema), async (req, res) => {
  try {
    const result = await query(
      `SELECT dr.*, p.name as project_name FROM daily_reports dr
       JOIN projects p ON dr.project_id = p.id
       WHERE dr.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return errorResponse(res, 'Daily report not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[DailyReports] Get error:', err);
    errorResponse(res, 'Failed to fetch daily report', 'INTERNAL_ERROR', 500);
  }
});

export { router as dailyReportsRouter };
