import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response.js';
import { auditLog } from '../utils/audit.js';
import { linkRecord } from '../utils/links.js';

const router = Router();

const meetingSchema = z.object({
  projectId: z.string().uuid().min(1),
  title: z.string().min(1).max(255),
  meetingType: z.enum(['safety_toolbox', 'standup', 'client_walkthrough', 'change_order', 'quality_review', 'progress_review', 'closeout', 'other']).optional(),
  scheduledAt: z.string().max(50).optional(),
  durationMinutes: z.number().int().min(1).max(480).optional(),
  location: z.string().max(255).optional(),
  agenda: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
});

const attendeeSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal('')),
  present: z.boolean().optional(),
});

const meetingWithAttendeesSchema = meetingSchema.extend({
  attendees: z.array(attendeeSchema).optional(),
});

const meetingIdSchema = z.object({ id: z.string().uuid() });

// ─── List Meetings ────────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const projectId = req.query.projectId as string;
    const status = req.query.status as string;
    const meetingType = req.query.meetingType as string;

    let baseWhere = 'p.user_id = $1';
    const baseParams: any[] = [userId];
    let idx = 2;

    if (projectId) { baseWhere += ` AND m.project_id = $${idx++}`; baseParams.push(projectId); }
    if (status) { baseWhere += ` AND m.status = $${idx++}`; baseParams.push(status); }
    if (meetingType) { baseWhere += ` AND m.meeting_type = $${idx++}`; baseParams.push(meetingType); }

    const countResult = await query(
      `SELECT COUNT(*) FROM meetings m JOIN projects p ON m.project_id = p.id WHERE ${baseWhere}`,
      baseParams
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await query(
      `SELECT
        m.*,
        p.name as project_name,
        json_agg(
          json_build_object(
            'id', ma.id,
            'name', ma.name,
            'role', ma.role,
            'email', ma.email,
            'present', ma.present,
            'arrivedAt', ma.arrived_at,
            'leftAt', ma.left_at,
            'signatureUrl', ma.signature_url
          ) ORDER BY ma.name
        ) FILTER (WHERE ma.id IS NOT NULL) as attendees
       FROM meetings m
       JOIN projects p ON m.project_id = p.id
       LEFT JOIN meeting_attendees ma ON ma.meeting_id = m.id
       WHERE ${baseWhere}
       GROUP BY m.id, p.name
       ORDER BY m.scheduled_at DESC NULLS LAST, m.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...baseParams, limit, offset]
    );

    paginatedResponse(res, result.rows, total, page, limit);
  } catch (err: any) {
    console.error('[Meetings] List error:', err);
    errorResponse(res, 'Failed to list meetings', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get Meeting by ID ────────────────────────────────────────────────────
router.get('/:id', authenticateToken, validateParams(meetingIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await query(
      `SELECT
        m.*,
        p.name as project_name,
        json_agg(
          json_build_object(
            'id', ma.id,
            'name', ma.name,
            'role', ma.role,
            'email', ma.email,
            'present', ma.present,
            'arrivedAt', ma.arrived_at,
            'leftAt', ma.left_at,
            'signatureUrl', ma.signature_url
          ) ORDER BY ma.name
        ) FILTER (WHERE ma.id IS NOT NULL) as attendees
       FROM meetings m
       JOIN projects p ON m.project_id = p.id
       LEFT JOIN meeting_attendees ma ON ma.meeting_id = m.id
       WHERE m.id = $1 AND p.user_id = $2
       GROUP BY m.id, p.name`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'Meeting not found', 'NOT_FOUND', 404);
    }

    successResponse(res, result.rows[0]);
  } catch (err: any) {
    console.error('[Meetings] Get error:', err);
    errorResponse(res, 'Failed to get meeting', 'INTERNAL_ERROR', 500);
  }
});

// ─── Create Meeting ───────────────────────────────────────────────────────
router.post('/', authenticateToken, validate(meetingWithAttendeesSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      projectId, title, meetingType, scheduledAt, durationMinutes,
      location, agenda, notes, status, attendees,
    } = req.body;

    // Verify project ownership
    const projectCheck = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) {
      return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
    }

    const meetingId = uuidv4();

    await transaction(async (client) => {
      await client.query(
        `INSERT INTO meetings
         (id, project_id, title, meeting_type, scheduled_at, duration_minutes,
          location, agenda, notes, status, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
        [meetingId, projectId, title, meetingType || 'other',
         scheduledAt || null, durationMinutes || null,
         location || null, agenda || null, notes || null,
         status || 'scheduled', userId]
      );

      if (attendees && attendees.length > 0) {
        const values = attendees.map((a: any, i: number) =>
          `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
        ).join(',');
        const params = attendees.flatMap((a: any) => [
          meetingId, a.name, a.role || null, a.email || null, a.present ?? false,
        ]);
        await client.query(
          `INSERT INTO meeting_attendees
           (meeting_id, name, role, email, present)
           VALUES ${values}`,
          params
        );
      }
    });

    await auditLog({
      eventType: 'meeting_created',
      userId,
      success: true,
      details: { entityId: meetingId, projectId, title, meetingType },
    });

    successResponse(res, { id: meetingId, message: 'Meeting created' }, 201);
  } catch (err: any) {
    console.error('[Meetings] Create error:', err);
    errorResponse(res, 'Failed to create meeting', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Meeting ───────────────────────────────────────────────────────
router.put('/:id', authenticateToken, validateParams(meetingIdSchema), validate(meetingWithAttendeesSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const {
      title, meetingType, scheduledAt, durationMinutes,
      location, agenda, notes, status, attendees,
    } = req.body;

    // Verify access
    const accessCheck = await query(
      `SELECT m.id FROM meetings m
       JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Meeting not found', 'NOT_FOUND', 404);
    }

    await transaction(async (client) => {
      await client.query(
        `UPDATE meetings SET
          title = COALESCE($1, title),
          meeting_type = COALESCE($2, meeting_type),
          scheduled_at = COALESCE($3, scheduled_at),
          duration_minutes = COALESCE($4, duration_minutes),
          location = COALESCE($5, location),
          agenda = COALESCE($6, agenda),
          notes = COALESCE($7, notes),
          status = COALESCE($8, status),
          updated_at = NOW()
         WHERE id = $9`,
        [title, meetingType, scheduledAt, durationMinutes, location, agenda, notes, status, id]
      );

      if (attendees) {
        await client.query('DELETE FROM meeting_attendees WHERE meeting_id = $1', [id]);
        if (attendees.length > 0) {
          const values = attendees.map((a: any, i: number) =>
            `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
          ).join(',');
          const params = attendees.flatMap((a: any) => [
            id, a.name, a.role || null, a.email || null, a.present ?? false,
          ]);
          await client.query(
            `INSERT INTO meeting_attendees
             (meeting_id, name, role, email, present)
             VALUES ${values}`,
            params
          );
        }
      }
    });

    await auditLog({
      eventType: 'meeting_updated',
      userId,
      success: true,
      details: { entityId: id, status },
    });

    successResponse(res, { id, message: 'Meeting updated' });
  } catch (err: any) {
    console.error('[Meetings] Update error:', err);
    errorResponse(res, 'Failed to update meeting', 'INTERNAL_ERROR', 500);
  }
});

// ─── Delete Meeting ───────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, validateParams(meetingIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const accessCheck = await query(
      `SELECT m.id FROM meetings m
       JOIN projects p ON m.project_id = p.id
       WHERE m.id = $1 AND p.user_id = $2`,
      [id, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Meeting not found', 'NOT_FOUND', 404);
    }

    await transaction(async (client) => {
      await client.query('DELETE FROM meeting_attendees WHERE meeting_id = $1', [id]);
      await client.query('DELETE FROM meetings WHERE id = $1', [id]);
    });

    await auditLog({
      eventType: 'meeting_deleted',
      userId,
      success: true,
      details: { entityId: id },
    });

    successResponse(res, { message: 'Meeting deleted' });
  } catch (err: any) {
    console.error('[Meetings] Delete error:', err);
    errorResponse(res, 'Failed to delete meeting', 'INTERNAL_ERROR', 500);
  }
});

export { router as meetingsRouter };
