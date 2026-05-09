"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProjects = listProjects;
exports.getProjectWithRelations = getProjectWithRelations;
exports.getProjectStats = getProjectStats;
const database_js_1 = require("../config/database.js");
async function listProjects(userId, filters = {}) {
    const { status, search, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    let countSql = 'SELECT COUNT(*) FROM projects WHERE user_id = $1';
    let sql = `SELECT p.*,
    (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
    (SELECT COUNT(*) FROM workers w JOIN project_workers pw ON w.id = pw.worker_id WHERE pw.project_id = p.id) as worker_count
    FROM projects p WHERE p.user_id = $1`;
    const params = [userId];
    const countParams = [userId];
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
        (0, database_js_1.query)(countSql, countParams),
        (0, database_js_1.query)(sql, params),
    ]);
    const total = parseInt(countResult.rows[0].count);
    return { data: dataResult.rows, total, page, limit };
}
async function getProjectWithRelations(projectId, userId) {
    const result = await (0, database_js_1.query)(`SELECT p.*,
      (SELECT json_agg(t.*) FROM tasks t WHERE t.project_id = p.id) as tasks,
      (SELECT json_agg(json_build_object('id', w.id, 'name', w.name, 'role', w.role, 'status', w.status))
       FROM workers w JOIN project_workers pw ON w.id = pw.worker_id WHERE pw.project_id = p.id) as workers,
      (SELECT json_agg(s.*) FROM safety_incidents s WHERE s.project_id = p.id) as incidents,
      (SELECT json_agg(i.*) FROM inspections i WHERE i.project_id = p.id) as inspections
     FROM projects p WHERE p.id = $1 AND p.user_id = $2`, [projectId, userId]);
    return result.rows[0] || null;
}
async function getProjectStats(projectId, userId) {
    const result = await (0, database_js_1.query)(`SELECT
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
      (SELECT progress FROM projects WHERE id = $1) as progress`, [projectId]);
    return result.rows[0] || null;
}
//# sourceMappingURL=projectService.js.map