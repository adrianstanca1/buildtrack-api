import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query, pool } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

const guestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255).optional(),
  company: z.string().max(255).optional(),
  phone: z.string().max(50).optional(),
});

const magicLinkSchema = z.object({
  guestId: z.string().uuid(),
  projectId: z.string().uuid(),
  targetType: z.string().max(50).optional(),
  targetId: z.string().uuid().optional(),
  action: z.enum(['view', 'respond', 'upload', 'approve']).optional(),
  expiresInHours: z.number().min(1).max(720).optional(), // max 30 days
});

// ─── List Guests ─────────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query(
      `SELECT g.*, COUNT(pg.id) as project_count
       FROM guests g
       LEFT JOIN project_guests pg ON pg.guest_id = g.id
       WHERE g.created_by = $1
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
      [userId]
    );
    successResponse(res, result.rows);
  } catch (err) {
    console.error('[Guests] List error:', err);
    errorResponse(res, 'Failed to fetch guests', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Guest ──────────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(guestSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { email, name, company, phone } = req.body;

    const existing = await query(
      'SELECT id FROM guests WHERE email = $1 AND company = $2 AND created_by = $3',
      [email, company || null, userId]
    );
    if (existing.rows.length > 0) {
      return errorResponse(res, 'Guest already exists', 'CONFLICT', 409);
    }

    const id = uuidv4();
    const result = await query(
      `INSERT INTO guests (id, email, name, company, phone, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`,
      [id, email, name || null, company || null, phone || null, userId]
    );

    successResponse(res, result.rows[0], 201);
  } catch (err) {
    console.error('[Guests] Create error:', err);
    errorResponse(res, 'Failed to create guest', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get Guest ─────────────────────────────────────────────────────────────
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT g.*, json_agg(pg.*) as projects
       FROM guests g
       LEFT JOIN project_guests pg ON pg.guest_id = g.id
       WHERE g.id = $1 AND g.created_by = $2
       GROUP BY g.id`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return errorResponse(res, 'Guest not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Guests] Get error:', err);
    errorResponse(res, 'Failed to fetch guest', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Magic Link ─────────────────────────────────────────────────────
router.post('/magic-links', authenticateToken, validate(magicLinkSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      guestId, projectId, targetType, targetId, action, expiresInHours,
    } = req.body;
    const userId = req.user!.id;

    // Verify guest exists and belongs to user
    const guestCheck = await client.query(
      'SELECT id FROM guests WHERE id = $1 AND created_by = $2',
      [guestId, userId]
    );
    if (guestCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 'Guest not found', 'NOT_FOUND', 404);
    }

    // Verify project access
    const projectCheck = await client.query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
    }

    // Create or update project_guests entry
    await client.query(
      `INSERT INTO project_guests (project_id, guest_id, role, invited_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, guest_id) DO UPDATE SET role = EXCLUDED.role, invited_at = NOW()`,
      [projectId, guestId, action === 'respond' ? 'responder' : action === 'upload' ? 'uploader' : 'viewer', userId]
    );

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + (expiresInHours || 168) * 3600000); // default 7 days

    const result = await client.query(
      `INSERT INTO magic_links (id, token, guest_id, project_id, target_type, target_id, action, expires_at, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *`,
      [uuidv4(), token, guestId, projectId, targetType || 'project', targetId || null, action || 'view', expiresAt, userId]
    );

    await client.query('COMMIT');

    // Return full URL
    const baseUrl = process.env.APP_URL || 'https://buildtrack.cortexbuildpro.com';
    successResponse(res, {
      ...result.rows[0],
      url: `${baseUrl}/guest?token=${token}`,
    }, 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Guests] Magic link error:', err);
    errorResponse(res, 'Failed to create magic link', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

// ─── Validate Magic Link ─────────────────────────────────────────────────
router.get('/access/:token', async (req, res) => {
  try {
    const result = await query(
      `SELECT ml.*, g.email, g.name, g.company, p.name as project_name
       FROM magic_links ml
       JOIN guests g ON ml.guest_id = g.id
       JOIN projects p ON ml.project_id = p.id
       WHERE ml.token = $1 AND ml.expires_at > NOW() AND ml.used_at IS NULL`,
      [req.params.token]
    );
    if (result.rows.length === 0) {
      return errorResponse(res, 'Invalid or expired link', 'UNAUTHORIZED', 401);
    }

    const link = result.rows[0];

    // Mark as used
    await query(
      'UPDATE magic_links SET used_at = NOW(), used_ip = $1 WHERE id = $2',
      [req.ip, link.id]
    );

    // Update access count
    await query(
      'UPDATE project_guests SET access_count = access_count + 1, last_accessed_at = NOW() WHERE guest_id = $1 AND project_id = $2',
      [link.guest_id, link.project_id]
    );

    successResponse(res, {
      guest: { id: link.guest_id, email: link.email, name: link.name, company: link.company },
      project: { id: link.project_id, name: link.project_name },
      access: { targetType: link.target_type, targetId: link.target_id, action: link.action },
      expiresAt: link.expires_at,
    });
  } catch (err) {
    console.error('[Guests] Access error:', err);
    errorResponse(res, 'Failed to validate magic link', 'INTERNAL_ERROR', 500);
  }
});

export { router as guestsRouter };
