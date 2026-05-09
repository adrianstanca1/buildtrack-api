import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

const incidentSchema = z.object({
  projectId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  date: z.string().datetime().optional(),
  injuries: z.number().min(0).optional(),
  witnesses: z.array(z.string()).optional(),
  photos: z.array(z.string().url()).optional(),
});

const incidentIdSchema = z.object({ id: z.string().uuid() });

router.get('/incidents', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const projectId = req.query.projectId as string;
    const severity = req.query.severity as string;
    const status = req.query.status as string;

    let sql = `SELECT si.*, p.name as project_name FROM safety_incidents si LEFT JOIN projects p ON si.project_id = p.id WHERE p.user_id = $1 OR si.reported_by = $1`;
    const params: any[] = [userId];
    let idx = 2;

    if (projectId) { sql += ` AND si.project_id = $${idx++}`; params.push(projectId); }
    if (severity) { sql += ` AND si.severity = $${idx++}`; params.push(severity); }
    if (status) { sql += ` AND si.status = $${idx++}`; params.push(status); }
    sql += ` ORDER BY si.date DESC`;

    const result = await query(sql, params);
    successResponse(res, result.rows);
  } catch (err) {
    errorResponse(res, 'Failed to fetch incidents', 'INTERNAL_ERROR', 500);
  }
});

router.post('/incidents', authenticateToken, validate(incidentSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { projectId, title, description, severity, date, injuries, witnesses, photos } = req.body;

    const result = await query(
      `INSERT INTO safety_incidents (project_id, reported_by, title, description, severity, date, injuries, witnesses, photos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [projectId || null, userId, title, description || null, severity || 'medium', date || new Date().toISOString(),
       injuries || 0, JSON.stringify(witnesses || []), JSON.stringify(photos || [])]
    );
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    errorResponse(res, 'Failed to create incident', 'INTERNAL_ERROR', 500);
  }
});

router.get('/incidents/:id', authenticateToken, validateParams(incidentIdSchema), async (req, res) => {
  try {
    const result = await query(
      `SELECT si.*, p.name as project_name FROM safety_incidents si LEFT JOIN projects p ON si.project_id = p.id WHERE si.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return errorResponse(res, 'Incident not found', 'NOT_FOUND', 404);
    successResponse(res, result.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to fetch incident', 'INTERNAL_ERROR', 500);
  }
});

router.put('/incidents/:id', authenticateToken, validateParams(incidentIdSchema), validate(incidentSchema.partial()), async (req, res) => {
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const fields = ['title', 'description', 'severity', 'date', 'injuries', 'witnesses', 'photos'];
    const dbFields = ['title', 'description', 'severity', 'date', 'injuries', 'witnesses', 'photos'];

    for (let i = 0; i < fields.length; i++) {
      const val = req.body[fields[i]];
      if (val !== undefined) {
        updates.push(`${dbFields[i]} = $${idx++}`);
        values.push(fields[i] === 'witnesses' || fields[i] === 'photos' ? JSON.stringify(val) : val);
      }
    }

    if (updates.length === 0) return errorResponse(res, 'No fields to update', 'VALIDATION_ERROR', 400);

    values.push(req.params.id);
    const sql = `UPDATE safety_incidents SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) return errorResponse(res, 'Incident not found', 'NOT_FOUND', 404);
    successResponse(res, result.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to update incident', 'INTERNAL_ERROR', 500);
  }
});

router.delete('/incidents/:id', authenticateToken, validateParams(incidentIdSchema), async (req, res) => {
  try {
    const result = await query('DELETE FROM safety_incidents WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return errorResponse(res, 'Incident not found', 'NOT_FOUND', 404);
    successResponse(res, { message: 'Incident deleted' });
  } catch (err) {
    errorResponse(res, 'Failed to delete incident', 'INTERNAL_ERROR', 500);
  }
});

export { router as safetyRouter };
