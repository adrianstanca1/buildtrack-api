import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, pool } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';

const router = Router();

const teamMemberSchema = z.object({
  projectId: z.string().uuid().optional(),
  name: z.string().min(1, 'Name is required').max(255),
  trade: z.string().max(100).optional(),
  cscsCard: z.string().max(100).optional(),
  hourlyRate: z.number().min(0).optional(),
  status: z.enum(['active', 'inactive', 'on-leave']).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
});

const teamMemberIdSchema = z.object({ id: z.string().uuid() });

// ─── List Team Members ───────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const projectId = req.query.projectId as string;
    const trade = req.query.trade as string;
    const status = req.query.status as string;

    let baseWhere = 'COALESCE(p.user_id, tm.user_id) = $1';
    const baseParams: any[] = [userId];
    let idx = 2;

    if (projectId) { baseWhere += ` AND tm.project_id = $${idx++}`; baseParams.push(projectId); }
    if (trade)     { baseWhere += ` AND tm.trade = $${idx++}`;     baseParams.push(trade); }
    if (status)    { baseWhere += ` AND tm.status = $${idx++}`;    baseParams.push(status); }

    const countResult = await query(
      `SELECT COUNT(*) FROM team_members tm LEFT JOIN projects p ON tm.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );

    const dataParams = [...baseParams, limit, offset];
    const dataResult = await query(
      `SELECT tm.*, p.name as project_name FROM team_members tm
       LEFT JOIN projects p ON tm.project_id = p.id
       WHERE ${baseWhere}
       ORDER BY tm.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      dataParams
    );

    const total = parseInt(countResult.rows[0].count);
    paginatedResponse(res, dataResult.rows, total, page, limit);
  } catch (err) {
    console.error('[TeamMembers] List error:', err);
    errorResponse(res, 'Failed to fetch team members', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Team Member ──────────────────────────────────────────────────
router.post('/', authenticateToken, validate(teamMemberSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = req.user!.id;
    const { projectId, name, trade, cscsCard, hourlyRate, status, phone, email } = req.body;

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
      `INSERT INTO team_members (id, user_id, project_id, name, trade, cscs_card, hourly_rate, status, phone, email, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
      [id, userId, projectId || null, name, trade || null, cscsCard || null,
       hourlyRate || 0, status || 'active', phone || null, email || null]
    );

    await client.query('COMMIT');
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[TeamMembers] Create error:', err);
    errorResponse(res, 'Failed to create team member', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

// ─── Get Team Member ─────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(teamMemberIdSchema), async (req, res) => {
  try {
    const result = await query(
      `SELECT tm.*, p.name as project_name FROM team_members tm
       LEFT JOIN projects p ON tm.project_id = p.id
       WHERE tm.id = $1 AND COALESCE(p.user_id, tm.user_id) = $2`,
      [req.params.id, req.user!.id]
    );
    if (result.rows.length === 0) {
      return errorResponse(res, 'Team member not found', 'NOT_FOUND', 404);
    }
    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[TeamMembers] Get error:', err);
    errorResponse(res, 'Failed to fetch team member', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Team Member ──────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(teamMemberIdSchema), validate(teamMemberSchema.partial()), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const teamMemberId = req.params.id;
    const userId = req.user!.id;

    const check = await client.query(
      `SELECT tm.id FROM team_members tm LEFT JOIN projects p ON tm.project_id = p.id WHERE tm.id = $1 AND COALESCE(p.user_id, tm.user_id) = $2`,
      [teamMemberId, userId]
    );
    if (check.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 'Team member not found', 'NOT_FOUND', 404);
    }

    const { projectId, name, trade, cscsCard, hourlyRate, status, phone, email } = req.body;

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

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const mappings: Record<string, string> = {
      projectId: 'project_id',
      name: 'name',
      trade: 'trade',
      cscsCard: 'cscs_card',
      hourlyRate: 'hourly_rate',
      status: 'status',
      phone: 'phone',
      email: 'email',
    };

    for (const [bodyKey, dbKey] of Object.entries(mappings)) {
      if (req.body[bodyKey] !== undefined) {
        updates.push(`${dbKey} = $${idx++}`);
        values.push(req.body[bodyKey]);
      }
    }

    if (updates.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 'No fields to update', 'VALIDATION_ERROR', 400);
    }

    values.push(teamMemberId);
    const sql = `UPDATE team_members SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await client.query(sql, values);

    await client.query('COMMIT');
    successResponse(res, result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[TeamMembers] Update error:', err);
    errorResponse(res, 'Failed to update team member', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

// ─── Delete Team Member ──────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(teamMemberIdSchema), async (req, res) => {
  try {
    const check = await query(
      `SELECT tm.id FROM team_members tm LEFT JOIN projects p ON tm.project_id = p.id WHERE tm.id = $1 AND COALESCE(p.user_id, tm.user_id) = $2`,
      [req.params.id, req.user!.id]
    );
    if (check.rows.length === 0) {
      return errorResponse(res, 'Team member not found', 'NOT_FOUND', 404);
    }

    await query('DELETE FROM team_members WHERE id = $1', [req.params.id]);
    successResponse(res, { message: 'Team member deleted' });
  } catch (err) {
    console.error('[TeamMembers] Delete error:', err);
    errorResponse(res, 'Failed to delete team member', 'INTERNAL_ERROR', 500);
  }
});

export { router as teamMembersRouter };
