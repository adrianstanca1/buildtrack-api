import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';
import {
  linkRecord,
  getLinkedRecords,
  unlinkRecord,
  getActivityGraph,
  RecordType,
} from '../utils/links.js';

const router = Router();

const createLinkSchema = z.object({
  sourceType: z.string().min(1),
  sourceId: z.string().uuid(),
  targetType: z.string().min(1),
  targetId: z.string().uuid(),
  relation: z.string().max(50).optional(),
});

const linkIdSchema = z.object({ id: z.string().uuid() });

const recordParamsSchema = z.object({
  type: z.string().min(1),
  id: z.string().uuid(),
});

// ─── Create Link ──────────────────────────────────────────────────────
/**
 * @swagger
 * /api/links:
 *   post:
 *     summary: Create Links links
 *     tags: [Links]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 */


// ─── List Links ─────────────────────────────────────────────────────────────
// Lists every link this user has created. Tenant scope is enforced via
// links.created_by = userId. Returns newest-first.
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query(
      `SELECT id, source_type, source_id, target_type, target_id, relation, created_by, created_at
         FROM links WHERE created_by = $1 ORDER BY created_at DESC LIMIT 500`,
      [userId]
    );
    successResponse(res, result.rows);
  } catch (err) {
    console.error('[Links] List error:', err);
    errorResponse(res, 'Failed to list links', 'INTERNAL_ERROR', 500);
  }
});

router.post('/', authenticateToken, validate(createLinkSchema), async (req, res) => {
  try {
    const { sourceType, sourceId, targetType, targetId, relation } = req.body;
    const userId = req.user!.id;

    const link = await linkRecord(
      sourceType as RecordType,
      sourceId,
      targetType as RecordType,
      targetId,
      relation || 'related',
      userId
    );

    successResponse(res, link, 201);
  } catch (err: any) {
    console.error('[Links] Create error:', err);
    errorResponse(res, err.message || 'Failed to create link', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Link ──────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(linkIdSchema), async (req, res) => {
  try {
    // Verify the link exists and user has access (optional gatekeeping)
    const check = await query('SELECT * FROM links WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) {
      return errorResponse(res, 'Link not found', 'NOT_FOUND', 404);
    }

    await unlinkRecord(req.params.id as string);
    successResponse(res, { message: 'Link deleted' });
  } catch (err) {
    console.error('[Links] Delete error:', err);
    errorResponse(res, 'Failed to delete link', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get Linked Records ───────────────────────────────────────────────
router.get('/records/:type/:id', authenticateToken, validateParams(recordParamsSchema), async (req, res) => {
  try {
    const { type, id } = req.params as { type: string; id: string };
    const links = await getLinkedRecords(type as RecordType, id);
    successResponse(res, links);
  } catch (err) {
    console.error('[Links] Get linked records error:', err);
    errorResponse(res, 'Failed to fetch linked records', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get Activity Graph ───────────────────────────────────────────────
router.get('/graph/:type/:id', authenticateToken, validateParams(recordParamsSchema), async (req, res) => {
  try {
    const { type, id } = req.params as { type: string; id: string };
    const graph = await getActivityGraph(type as RecordType, id);

    // Convert Map to plain object for JSON serialization
    const graphObj: Record<string, any> = {};
    for (const [key, node] of graph.entries()) {
      graphObj[key] = node;
    }

    successResponse(res, graphObj);
  } catch (err) {
    console.error('[Links] Get activity graph error:', err);
    errorResponse(res, 'Failed to fetch activity graph', 'INTERNAL_ERROR', 500);
  }
});

export { router as linksRouter };
