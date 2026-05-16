import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

const inspectionSchema = z.object({
  projectId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required').max(255),
  inspectorName: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['pending', 'passed', 'failed']).optional(),
  date: z.string().datetime().optional(),
  findings: z.array(z.string()).optional(),
  photos: z.array(z.string().url()).optional(),
});

const inspectionIdSchema = z.object({ id: z.string().uuid() });

/**
 * @swagger
 * /api/inspections:
 *   get:
 *     summary: List or retrieve Inspections inspections
 *     tags: [Inspections]
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
    const projectId = req.query.projectId as string;
    const status = req.query.status as string;

    let sql = `SELECT i.*, p.name as project_name FROM inspections i LEFT JOIN projects p ON i.project_id = p.id WHERE p.user_id = $1`;
    const params: any[] = [userId];
    let idx = 2;

    if (projectId) { sql += ` AND i.project_id = $${idx++}`; params.push(projectId); }
    if (status) { sql += ` AND i.status = $${idx++}`; params.push(status); }
    sql += ` ORDER BY i.date DESC`;

    const result = await query(sql, params);
    successResponse(res, result.rows);
  } catch (err) {
    errorResponse(res, 'Failed to fetch inspections', 'INTERNAL_ERROR', 500);
  }
});

router.post('/', authenticateToken, validate(inspectionSchema), async (req, res) => {
  try {
    const { projectId, title, inspectorName, description, status, date, findings, photos } = req.body;
    const result = await query(
      `INSERT INTO inspections (project_id, title, inspector_name, description, status, date, findings, photos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [projectId || null, title, inspectorName || null, description || null, status || 'pending', date || new Date().toISOString(),
       JSON.stringify(findings || []), JSON.stringify(photos || [])]
    );
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    errorResponse(res, 'Failed to create inspection', 'INTERNAL_ERROR', 500);
  }
});

router.get('/:id', authenticateToken, validateParams(inspectionIdSchema), async (req, res) => {
  try {
    const result = await query('SELECT * FROM inspections WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return errorResponse(res, 'Inspection not found', 'NOT_FOUND', 404);
    successResponse(res, result.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to fetch inspection', 'INTERNAL_ERROR', 500);
  }
});

router.put('/:id', authenticateToken, validateParams(inspectionIdSchema), validate(inspectionSchema.partial()), async (req, res) => {
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const fields = ['title', 'inspectorName', 'description', 'status', 'date', 'findings', 'photos'];
    const dbFields = ['title', 'inspector_name', 'description', 'status', 'date', 'findings', 'photos'];

    for (let i = 0; i < fields.length; i++) {
      const val = req.body[fields[i]];
      if (val !== undefined) {
        updates.push(`${dbFields[i]} = $${idx++}`);
        values.push(fields[i] === 'findings' || fields[i] === 'photos' ? JSON.stringify(val) : val);
      }
    }

    if (updates.length === 0) return errorResponse(res, 'No fields to update', 'VALIDATION_ERROR', 400);

    values.push(req.params.id);
    const sql = `UPDATE inspections SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) return errorResponse(res, 'Inspection not found', 'NOT_FOUND', 404);
    successResponse(res, result.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to update inspection', 'INTERNAL_ERROR', 500);
  }
});

router.delete('/:id', authenticateToken, validateParams(inspectionIdSchema), async (req, res) => {
  try {
    const result = await query('DELETE FROM inspections WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return errorResponse(res, 'Inspection not found', 'NOT_FOUND', 404);
    successResponse(res, { message: 'Inspection deleted' });
  } catch (err) {
    errorResponse(res, 'Failed to delete inspection', 'INTERNAL_ERROR', 500);
  }
});

export { router as inspectionsRouter };
