import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const stats = await query(
      `SELECT
        (SELECT COUNT(*) FROM projects WHERE user_id = $1) as total_projects,
        (SELECT COUNT(*) FROM projects WHERE user_id = $1 AND status = 'active') as active_projects,
        (SELECT COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.user_id = $1) as total_tasks,
        (SELECT COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.user_id = $1 AND t.status = 'completed') as completed_tasks,
        (SELECT COUNT(*) FROM tasks t JOIN projects p ON t.project_id = p.id WHERE p.user_id = $1 AND t.status = 'pending') as pending_tasks,
        (SELECT COUNT(*) FROM workers WHERE user_id = $1) as total_workers,
        (SELECT COUNT(*) FROM workers WHERE user_id = $1 AND status = 'active') as active_workers,
        (SELECT COUNT(*) FROM safety_incidents si JOIN projects p ON si.project_id = p.id WHERE p.user_id = $1) as total_incidents,
        (SELECT COUNT(*) FROM safety_incidents si JOIN projects p ON si.project_id = p.id WHERE p.user_id = $1 AND si.severity = 'critical') as critical_incidents,
        (SELECT COUNT(*) FROM inspections i JOIN projects p ON i.project_id = p.id WHERE p.user_id = $1) as total_inspections,
        (SELECT COUNT(*) FROM inspections i JOIN projects p ON i.project_id = p.id WHERE p.user_id = $1 AND i.status = 'passed') as passed_inspections,
        (SELECT COALESCE(SUM(budget), 0) FROM projects WHERE user_id = $1) as total_budget,
        (SELECT COALESCE(SUM(spent), 0) FROM projects WHERE user_id = $1) as total_spent`,
      [userId]
    );

    successResponse(res, stats.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to fetch dashboard stats', 'INTERNAL_ERROR', 500);
  }
});

router.get('/activity', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await query(
      `SELECT al.*, p.name as project_name, u.first_name, u.last_name
       FROM activity_logs al
       LEFT JOIN projects p ON al.project_id = p.id
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.user_id = $1 OR p.user_id = $1
       ORDER BY al.created_at DESC LIMIT $2`,
      [userId, limit]
    );

    successResponse(res, result.rows);
  } catch (err) {
    errorResponse(res, 'Failed to fetch activity', 'INTERNAL_ERROR', 500);
  }
});

export { router as dashboardRouter };
