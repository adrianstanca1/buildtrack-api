import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, pool } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';

const router = Router();

const defectSchema = z.object({
  projectId: z.string().uuid().min(1),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  location: z.string().optional(),
  trade: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'disputed']).optional(),
  assignedTo: z.string().optional(),
  reportedBy: z.string().min(1),
  dueDate: z.string().datetime().optional(),
  photoUrls: z.string().optional(),
});

const defectIdSchema = z.object({ id: z.string().uuid() });

// ─── List Defects ────────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const projectId = req.query.projectId as string;
    const status = req.query.status as string;
    const priority = req.query.priority as string;

    let baseWhere = 'p.user_id = $1';
    const baseParams: any[] = [userId];
    let idx = 2;

    if (projectId) { baseWhere += ` AND d.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status)     { baseWhere += ` AND d.status = $${idx++}`;     baseParams.push(status); }
    if (priority)   { baseWhere += ` AND d.priority = $${idx++}`;   baseParams.push(priority); }

    const countResult = await query(
      `SELECT COUNT(*) FROM defects d JOIN projects p ON d.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT d.*, p.name as project_name FROM defects d
       JOIN projects p ON d.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY d.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[Defects] List error:', err);
    errorResponse(res, 'Failed to fetch defects', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Defect ───────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(defectSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      projectId, title, description, location, trade, priority, status,
      assignedTo, reportedBy, dueDate, photoUrls,
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
      `INSERT INTO defects (id, project_id, title, description, location, trade, priority, status, assigned_to, reported_by, due_date, photo_urls, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW()) RETURNING *`,
      [id, projectId, title, description || null, location || null, trade || null,
       priority || 'medium', status || 'open', assignedTo || null, reportedBy,
       dueDate || null, photoUrls || null]
    );

    await client.query('COMMIT');
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Defects] Create error:', err);
    errorResponse(res, 'Failed to create defect', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

// ─── Get Defect ──────────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(defectIdSchema), async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, p.name as project_name FROM defects d
       JOIN projects p ON d.project_id = p.id
       WHERE d.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return errorResponse(res, 'Defect not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Defects] Get error:', err);
    errorResponse(res, 'Failed to fetch defect', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Defect ───────────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(defectIdSchema), validate(defectSchema.partial()), async (req, res) => {
  try {
    const defectId = req.params.id;
    const userId = req.user!.id;

    const check = await query(
      `SELECT d.id FROM defects d JOIN projects p ON d.project_id = p.id WHERE d.id = $1 AND p.user_id = $2`,
      [defectId, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Defect not found', 'NOT_FOUND', 404);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const mappings: Record<string, string> = {
      projectId: 'project_id',
      title: 'title',
      description: 'description',
      location: 'location',
      trade: 'trade',
      priority: 'priority',
      status: 'status',
      assignedTo: 'assigned_to',
      reportedBy: 'reported_by',
      dueDate: 'due_date',
      photoUrls: 'photo_urls',
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

    values.push(defectId);
    const sql = `UPDATE defects SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Defects] Update error:', err);
    errorResponse(res, 'Failed to update defect', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Defect ───────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(defectIdSchema), async (req, res) => {
  try {
    const check = await query(
      `SELECT d.id FROM defects d JOIN projects p ON d.project_id = p.id WHERE d.id = $1 AND p.user_id = $2`,
      [req.params.id, req.user!.id]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Defect not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM defects WHERE id = $1', [req.params.id]);
    successResponse(res, { message: 'Defect deleted' });
  } catch (err) {
    console.error('[Defects] Delete error:', err);
    errorResponse(res, 'Failed to delete defect', 'INTERNAL_ERROR', 500);
  }
});

export { router as defectsRouter };
