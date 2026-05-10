import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';

const router = Router();

const sitePhotoSchema = z.object({
  projectId: z.string().uuid().optional(),
  location: z.string().max(255).optional(),
  tags: z.array(z.string()).optional(),
  caption: z.string().optional(),
  photoUrl: z.string().url(),
});

const sitePhotoIdSchema = z.object({ id: z.string().uuid() });

// ─── List Site Photos ──────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const projectId = req.query.projectId as string;
    const tag = req.query.tag as string;

    let baseWhere = 'p.user_id = $1';
    const baseParams: any[] = [userId];
    let idx = 2;

    if (projectId) { baseWhere += ` AND sp.project_id = $${idx++}`; baseParams.push(projectId); }
    if (tag)       { baseWhere += ` AND sp.tags \u003c@ ARRAY[$${idx++}]::text[]`; baseParams.push(tag); }

    const countResult = await query(
      `SELECT COUNT(*) FROM site_photos sp JOIN projects p ON sp.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT sp.*, p.name as project_name FROM site_photos sp
       JOIN projects p ON sp.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY sp.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[SitePhotos] List error:', err);
    errorResponse(res, 'Failed to fetch site photos', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Site Photo ─────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(sitePhotoSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { projectId, location, tags, caption, photoUrl } = req.body;

    const result = await query(
      `INSERT INTO site_photos (project_id, uploaded_by, location, tags, caption, photo_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [projectId || null, userId, location || null, JSON.stringify(tags || []), caption || null, photoUrl]
    );

    successResponse(res, result.rows[0], 201);
  } catch (err) {
    console.error('[SitePhotos] Create error:', err);
    errorResponse(res, 'Failed to create site photo', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get Site Photo ──────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(sitePhotoIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await query(
      `SELECT sp.*, p.name as project_name FROM site_photos sp
       JOIN projects p ON sp.project_id = p.id
       WHERE sp.id = $1 AND p.user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'Site photo not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[SitePhotos] Get error:', err);
    errorResponse(res, 'Failed to fetch site photo', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Site Photo ─────────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(sitePhotoIdSchema), validate(sitePhotoSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { projectId, location, tags, caption, photoUrl } = req.body;

    const check = await query(
      `SELECT sp.id FROM site_photos sp
       JOIN projects p ON sp.project_id = p.id
       WHERE sp.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Site photo not found', 'NOT_FOUND', 404);
    }

    const result = await query(
      `UPDATE site_photos SET
        project_id = COALESCE($1, project_id),
        location = COALESCE($2, location),
        tags = COALESCE($3, tags),
        caption = COALESCE($4, caption),
        photo_url = COALESCE($5, photo_url)
       WHERE id = $6 RETURNING *`,
      [projectId || null, location || null, tags ? JSON.stringify(tags) : null,
       caption || null, photoUrl || null, id]
    );

    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[SitePhotos] Update error:', err);
    errorResponse(res, 'Failed to update site photo', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Site Photo ─────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(sitePhotoIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const check = await query(
      `SELECT sp.id FROM site_photos sp
       JOIN projects p ON sp.project_id = p.id
       WHERE sp.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Site photo not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM site_photos WHERE id = $1', [id]);
    successResponse(res, { deleted: true });
  } catch (err) {
    console.error('[SitePhotos] Delete error:', err);
    errorResponse(res, 'Failed to delete site photo', 'INTERNAL_ERROR', 500);
  }
});

export { router as sitePhotosRouter };
