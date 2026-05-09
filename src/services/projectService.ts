import { query } from '../config/database.js';

export interface ProjectFilters {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listProjects(userId: string, filters: ProjectFilters = {}) {
  const { status, search, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let countSql = 'SELECT COUNT(*) FROM projects WHERE user_id = $1';
  let sql = `SELECT p.*,
    (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
    (SELECT COUNT(*) FROM workers w JOIN project_workers pw ON w.id = pw.worker_id WHERE pw.project_id = p.id) as worker_count
    FROM projects p WHERE p.user_id = $1`;

  const params: any[] = [userId];
  const countParams: any[] = [userId];
  let idx = 2;

  if (status) {
    countSql += ` AND status = $${idx}`;
    sql += ` AND p.status = $${idx}`;
    countParams.push(status);
    params.push(status);
    idx++;
  }

  if (search) {
    countSql += ` AND (name ILIKE $${idx} OR location ILIKE $${idx})`;
    sql += ` AND (p.name ILIKE $${idx} OR p.location ILIKE $${idx})`;
    countParams.push(`%${search}%`);
    params.push(`%${search}%`);
    idx++;
  }

  sql += ` ORDER BY p.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(limit, offset);

  const [countResult, dataResult] = await Promise.all([
    query(countSql, countParams),
    query(sql, params),
  ]);

  const total = parseInt(countResult.rows[0].count);
  return { data: dataResult.rows, total, page, limit };
}

export async function getProjectWithRelations(projectId: string, userId: string) {
  const result = await query(
    `SELECT p.*,
      (SELECT json_agg(t.*) FROM tasks t WHERE t.project_id = p.id) as tasks,
      (SELECT json_agg(json_build_object('id', w.id, 'name', w.name, 'role', w.role, 'status', w.status))
       FROM workers w JOIN project_workers pw ON w.id = pw.worker_id WHERE pw.project_id = p.id) as workers,
      (SELECT json_agg(s.*) FROM safety_incidents s WHERE s.project_id = p.id) as incidents,
      (SELECT json_agg(i.*) FROM inspections i WHERE i.project_id = p.id) as inspections
     FROM projects p WHERE p.id = $1 AND p.user_id = $2`,
    [projectId, userId]
  );
  return result.rows[0] || null;
}

export async function getProjectStats(projectId: string, userId: string) {
  const result = await query(
    `SELECT
      (SELECT COUNT(*) FROM tasks WHERE project_id = $1) as total_tasks,
      (SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status = 'completed') as completed_tasks,
      (SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status = 'in-progress') as in_progress_tasks,
      (SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status = 'pending') as pending_tasks,
      (SELECT COUNT(*) FROM workers w JOIN project_workers pw ON w.id = pw.worker_id WHERE pw.project_id = $1) as total_workers,
      (SELECT COUNT(*) FROM safety_incidents WHERE project_id = $1) as total_incidents,
      (SELECT COUNT(*) FROM inspections WHERE project_id = $1) as total_inspections,
      (SELECT COUNT(*) FROM inspections WHERE project_id = $1 AND status = 'passed') as passed_inspections,
      (SELECT budget FROM projects WHERE id = $1) as budget,
      (SELECT spent FROM projects WHERE id = $1) as spent,
      (SELECT progress FROM projects WHERE id = $1) as progress`,
    [projectId]
  );
  return result.rows[0] || null;
}
