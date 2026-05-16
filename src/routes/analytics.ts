/**
 * Analytics dashboard routes — project-level metrics.
 * On-time %, budget variance, safety incident rate, RFI response time.
 */

import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

/**
 * GET /api/analytics/:projectId
 * Project-level analytics metrics.
 */
/**
 * @swagger
 * /api/analytics/{projectId}:
 *   get:
 *     summary: List or retrieve Analytics analytics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 */


router.get('/:projectId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const projectId = req.params.projectId;

    // Verify ownership
    const projCheck = await query(
      'SELECT id, budget, spent, start_date, end_date, status FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projCheck.rows.length === 0) {
      return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
    }
    const project = projCheck.rows[0];

    // ─── On-time % (tasks completed by due_date vs total tasks) ───
    const onTimeResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at <= due_date) as on_time_tasks
      FROM tasks WHERE project_id = $1`,
      [projectId]
    );
    const totalTasks = parseInt(onTimeResult.rows[0].total_tasks) || 0;
    const onTimeTasks = parseInt(onTimeResult.rows[0].on_time_tasks) || 0;
    const onTimePercent = totalTasks > 0 ? Math.round((onTimeTasks / totalTasks) * 100) : 0;

    // ─── Budget variance ───
    const budget = parseFloat(project.budget) || 0;
    const spent = parseFloat(project.spent) || 0;
    const budgetVariance = budget > 0 ? Math.round(((spent - budget) / budget) * 100) : 0;

    // ─── Safety incident rate (per 100,000 hours or per month) ───
    const safetyResult = await query(
      `SELECT
        COUNT(*) as total_incidents,
        COUNT(*) FILTER (WHERE severity IN ('high', 'critical')) as severe_incidents,
        COUNT(DISTINCT DATE_TRUNC('month', date)) as months_with_incidents
      FROM safety_incidents WHERE project_id = $1`,
      [projectId]
    );
    const totalIncidents = parseInt(safetyResult.rows[0].total_incidents) || 0;
    const severeIncidents = parseInt(safetyResult.rows[0].severe_incidents) || 0;
    const incidentRate = totalIncidents; // raw count; could normalise by hours

    // ─── RFI response time (average hours from created to reviewed/approved) ───
    const rfiResult = await query(
      `SELECT
        AVG(EXTRACT(EPOCH FROM (reviewed_date - created_at))/3600) as avg_response_hours,
        COUNT(*) as total_rsis,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_rsis,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_rsis,
        COUNT(*) FILTER (WHERE status = 'under_review') as pending_rsis
      FROM rfis WHERE project_id = $1 AND reviewed_date IS NOT NULL`,
      [projectId]
    );
    const avgResponseHours = rfiResult.rows[0].avg_response_hours
      ? Math.round(parseFloat(rfiResult.rows[0].avg_response_hours))
      : 0;
    const totalRFIs = parseInt(rfiResult.rows[0].total_rsis) || 0;
    const approvedRFIs = parseInt(rfiResult.rows[0].approved_rsis) || 0;
    const pendingRFIs = parseInt(rfiResult.rows[0].pending_rsis) || 0;

    // ─── Schedule health ───
    const scheduleResult = await query(
      `SELECT
        COUNT(*) as total_schedules,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_schedules,
        COUNT(*) FILTER (WHERE status = 'not_started') as not_started_schedules,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_schedules
      FROM schedules WHERE project_id = $1`,
      [projectId]
    );
    const totalSchedules = parseInt(scheduleResult.rows[0].total_schedules) || 0;
    const completedSchedules = parseInt(scheduleResult.rows[0].completed_schedules) || 0;
    const scheduleProgress = totalSchedules > 0 ? Math.round((completedSchedules / totalSchedules) * 100) : 0;

    // ─── Change order impact ───
    const coResult = await query(
      `SELECT
        COUNT(*) as total_cos,
        COALESCE(SUM(impact_cost), 0) as total_cost_impact,
        COALESCE(SUM(impact_days), 0) as total_days_impact
      FROM change_orders WHERE project_id = $1 AND status = 'approved'`,
      [projectId]
    );
    const totalCOs = parseInt(coResult.rows[0].total_cos) || 0;
    const costImpact = parseFloat(coResult.rows[0].total_cost_impact) || 0;
    const daysImpact = parseInt(coResult.rows[0].total_days_impact) || 0;

    successResponse(res, {
      projectId,
      onTimePercent,
      totalTasks,
      onTimeTasks,
      budget,
      spent,
      budgetVariance,
      totalIncidents,
      severeIncidents,
      incidentRate,
      avgResponseHours,
      totalRFIs,
      approvedRFIs,
      pendingRFIs,
      scheduleProgress,
      totalSchedules,
      completedSchedules,
      totalCOs,
      costImpact,
      daysImpact,
    });
  } catch (err) {
    console.error('[Analytics] Error:', err);
    errorResponse(res, 'Failed to fetch analytics', 'INTERNAL_ERROR', 500);
  }
});

/**
 * GET /api/analytics/summary
 * Cross-project summary for the current user.
 */
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const summary = await query(
      `SELECT
        (SELECT COUNT(*) FROM projects WHERE user_id = $1) as project_count,
        (SELECT COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.user_id = $1) as total_tasks,
        (SELECT COUNT(*) FILTER (WHERE t.status = 'completed') FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.user_id = $1) as completed_tasks,
        (SELECT COUNT(*) FILTER (WHERE t.status = 'pending' AND t.due_date < NOW()) FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.user_id = $1) as overdue_tasks,
        (SELECT COALESCE(SUM(budget), 0) FROM projects WHERE user_id = $1) as total_budget,
        (SELECT COALESCE(SUM(spent), 0) FROM projects WHERE user_id = $1) as total_spent,
        (SELECT COUNT(*) FROM safety_incidents si JOIN projects p ON si.project_id = p.id WHERE p.user_id = $1) as total_incidents,
        (SELECT COUNT(*) FROM rfis r JOIN projects p ON r.project_id = p.id WHERE p.user_id = $1) as total_rsis`,
      [userId]
    );

    const r = summary.rows[0];
    const totalTasks = parseInt(r.total_tasks) || 0;
    const completedTasks = parseInt(r.completed_tasks) || 0;
    const overdueTasks = parseInt(r.overdue_tasks) || 0;
    const totalBudget = parseFloat(r.total_budget) || 0;
    const totalSpent = parseFloat(r.total_spent) || 0;

    successResponse(res, {
      projectCount: parseInt(r.project_count) || 0,
      totalTasks,
      completedTasks,
      overdueTasks,
      onTimePercent: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      totalBudget,
      totalSpent,
      budgetVariance: totalBudget > 0 ? Math.round(((totalSpent - totalBudget) / totalBudget) * 100) : 0,
      totalIncidents: parseInt(r.total_incidents) || 0,
      totalRFIs: parseInt(r.total_rsis) || 0,
      overdueRate: totalTasks > 0 ? Math.round((overdueTasks / totalTasks) * 100) : 0,
    });
  } catch (err) {
    console.error('[Analytics] Summary error:', err);
    errorResponse(res, 'Failed to fetch analytics summary', 'INTERNAL_ERROR', 500);
  }
});

export { router as analyticsRouter };
