import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router({ mergeParams: true });

interface TimelineEvent {
  id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  description: string;
  created_at: string;
  created_by?: string;
  project_id: string;
  metadata?: Record<string, any>;
}

// ─── Project Activity Timeline ─────────────────────────────────────────────
/**
 * @swagger
 * /api/projects/{projectId}/timeline:
 *   get:
 *     summary: List or retrieve Project Timeline timeline
 *     tags: [Project Timeline]
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
    const projectId = req.params.projectId;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    // Verify project access
    const accessCheck = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (accessCheck.rows.length === 0) {
      return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
    }

    const events: TimelineEvent[] = [];

    // Drawing events
    const drawings = await query(
      `SELECT id, title, status, created_at, uploaded_by_id as created_by,
        'drawing' as entity_type, 
        CASE WHEN status = 'superseded' THEN 'Drawing superseded'
             WHEN status = 'archived' THEN 'Drawing archived'
             ELSE 'Drawing uploaded' END as title
       FROM drawings WHERE project_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [projectId, limit]
    );
    drawings.rows.forEach((r: any) => events.push({ ...r, type: 'drawing', description: `${r.title}`, project_id: projectId }));

    // RFI events
    const rfis = await query(
      `SELECT id, subject as title, status, created_at, raised_by_id as created_by,
        'rfi' as entity_type,
        'RFI ' || COALESCE(status, 'created') as title,
        question as description
       FROM rfis WHERE project_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [projectId, limit]
    );
    rfis.rows.forEach((r: any) => events.push({ ...r, type: 'rfi', project_id: projectId }));

    // Submittal events
    const submittals = await query(
      `SELECT id, title, status, created_at, created_by as created_by,
        'submittal' as entity_type,
        'Submittal ' || COALESCE(status, 'created') as title
       FROM submittals WHERE project_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [projectId, limit]
    );
    submittals.rows.forEach((r: any) => events.push({ ...r, type: 'submittal', description: r.title, project_id: projectId }));

    // Daily report events
    const dailyReports = await query(
      `SELECT id, report_date as title, status, created_at, submitted_by as created_by,
        'daily_report' as entity_type,
        'Daily report submitted' as title
       FROM daily_reports WHERE project_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [projectId, limit]
    );
    dailyReports.rows.forEach((r: any) => events.push({ ...r, type: 'daily_report', description: `Report for ${r.title}`, project_id: projectId }));

    // Defect events
    const defects = await query(
      `SELECT id, title, status, created_at, reported_by as created_by,
        'defect' as entity_type,
        'Punch item ' || COALESCE(status, 'created') as title
       FROM defects WHERE project_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [projectId, limit]
    );
    defects.rows.forEach((r: any) => events.push({ ...r, type: 'defect', description: r.title, project_id: projectId }));

    // Audit log events
    const auditLogs = await query(
      `SELECT id, event_type as title, created_at, user_id as created_by,
        'audit' as entity_type,
        details as description
       FROM audit_logs 
       WHERE entity_id = $1 OR (details->>'projectId') = $1
       ORDER BY created_at DESC LIMIT $2`,
      [projectId, limit]
    );
    auditLogs.rows.forEach((r: any) => events.push({ ...r, type: 'audit', project_id: projectId, metadata: r.description }));

    // Sort all by created_at desc, apply offset/limit
    events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const paginated = events.slice(offset, offset + limit);

    successResponse(res, {
      events: paginated,
      total: events.length,
      offset,
      limit,
    });
  } catch (err) {
    console.error('[ProjectTimeline] Error:', err);
    errorResponse(res, 'Failed to fetch timeline', 'INTERNAL_ERROR', 500);
  }
});

export { router as projectTimelineRouter };
