import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

// ─── Risk Dashboard ──────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;

    const [
      overdueRfis,
      overdueSubmittals,
      openPunchByAge,
      missingDailyLogs,
      recentDrawings,
      slowResponders,
      openRfiCount,
      openSubmittalCount,
      projectHealth,
    ] = await Promise.all([
      // Overdue RFIs
      query(
        `SELECT COUNT(*) FROM rfis r
         JOIN projects p ON r.project_id = p.id
         WHERE p.user_id = $1 AND r.status IN ('submitted', 'open')
         AND r.due_date IS NOT NULL AND r.due_date < CURRENT_DATE`,
        [userId]
      ),
      // Overdue submittals
      query(
        `SELECT COUNT(*) FROM submittals s
         JOIN projects p ON s.project_id = p.id
         WHERE p.user_id = $1 AND s.status IN ('draft', 'submitted', 'under_review')
         AND s.due_date IS NOT NULL AND s.due_date < CURRENT_DATE`,
        [userId]
      ),
      // Open punch/defects by age
      query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as week_old,
           COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '7 days' AND created_at > NOW() - INTERVAL '30 days') as month_old,
           COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '30 days') as older
         FROM defects d
         JOIN projects p ON d.project_id = p.id
         WHERE p.user_id = $1 AND d.status IN ('open', 'in-progress')`,
        [userId]
      ),
      // Projects missing daily logs in last 3 days
      query(
        `SELECT COUNT(*) FROM (
          SELECT p.id FROM projects p
          LEFT JOIN daily_reports dr ON dr.project_id = p.id AND dr.report_date >= CURRENT_DATE - INTERVAL '3 days'
          WHERE p.user_id = $1 AND p.status = 'active'
          GROUP BY p.id
          HAVING COUNT(dr.id) = 0
        ) missing`,
        [userId]
      ),
      // Recent drawing revisions
      query(
        `SELECT d.*, p.name as project_name FROM drawings d
         JOIN projects p ON d.project_id = p.id
         WHERE p.user_id = $1 AND d.created_at > NOW() - INTERVAL '7 days'
         ORDER BY d.created_at DESC LIMIT 5`,
        [userId]
      ),
      // Slow responders (top companies with overdue items)
      query(
        `SELECT
          COALESCE(r.responsible_company, 'Unassigned') as company,
          COUNT(*) as overdue_count
         FROM rfis r
         JOIN projects p ON r.project_id = p.id
         WHERE p.user_id = $1 AND r.status IN ('submitted', 'open')
         AND r.due_date IS NOT NULL AND r.due_date < CURRENT_DATE
         GROUP BY r.responsible_company
         ORDER BY overdue_count DESC LIMIT 5`,
        [userId]
      ),
      // Open RFIs
      query(
        `SELECT COUNT(*) FROM rfis r
         JOIN projects p ON r.project_id = p.id
         WHERE p.user_id = $1 AND r.status IN ('submitted', 'open')`,
        [userId]
      ),
      // Open submittals
      query(
        `SELECT COUNT(*) FROM submittals s
         JOIN projects p ON s.project_id = p.id
         WHERE p.user_id = $1 AND s.status IN ('draft', 'submitted', 'under_review')`,
        [userId]
      ),
      // Project health scores
      query(
        `WITH project_risks AS (
          SELECT
            p.id,
            p.name,
            COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('submitted', 'open')) as open_rfis,
            COUNT(DISTINCT s.id) FILTER (WHERE s.status IN ('draft', 'submitted', 'under_review')) as open_submittals,
            COUNT(DISTINCT d.id) FILTER (WHERE d.status IN ('open', 'in-progress')) as open_defects
          FROM projects p
          LEFT JOIN rfis r ON r.project_id = p.id
          LEFT JOIN submittals s ON s.project_id = p.id
          LEFT JOIN defects d ON d.project_id = p.id
          WHERE p.user_id = $1 AND p.status = 'active'
          GROUP BY p.id, p.name
        )
        SELECT id, name, open_rfis, open_submittals, open_defects,
          CASE
            WHEN open_rfis > 5 OR open_submittals > 5 OR open_defects > 10 THEN 'at_risk'
            WHEN open_rfis > 0 OR open_submittals > 0 OR open_defects > 0 THEN 'warning'
            ELSE 'healthy'
          END as health
        FROM project_risks
        ORDER BY open_rfis + open_submittals + open_defects DESC
        LIMIT 10`,
        [userId]
      ),
    ]);

    successResponse(res, {
      summary: {
        overdueRfis: parseInt(overdueRfis.rows[0].count),
        overdueSubmittals: parseInt(overdueSubmittals.rows[0].count),
        openRfiCount: parseInt(openRfiCount.rows[0].count),
        openSubmittalCount: parseInt(openSubmittalCount.rows[0].count),
        missingDailyLogs: parseInt(missingDailyLogs.rows[0].count),
      },
      agingPunch: openPunchByAge.rows[0],
      recentDrawings: recentDrawings.rows,
      slowResponders: slowResponders.rows,
      projectHealth: projectHealth.rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[RiskDashboard] Error:', err);
    errorResponse(res, 'Failed to fetch risk dashboard', 'INTERNAL_ERROR', 500);
  }
});

export { router as riskDashboardRouter };
