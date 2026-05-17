import { Router } from 'express';

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: List all tasks for the authenticated user
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of tasks
 *       401:
 *         description: Unauthorized
 */

import { z } from 'zod';
import { query } from '../config/database.js';
import { validate, validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

const taskSchema = z.object({
  projectId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  assignedTo: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['pending', 'in-progress', 'completed']).optional(),
  dueDate: z.string().datetime().optional(),
});

const taskIdSchema = z.object({ id: z.string().uuid() });

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const projectId = req.query.projectId as string;
    const status = req.query.status as string;
    const priority = req.query.priority as string;

    let sql = `SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE (t.assigned_to = $1 OR p.user_id = $1)`;
    const params: any[] = [userId];
    let idx = 2;

    if (projectId) { sql += ` AND t.project_id = $${idx++}`; params.push(projectId); }
    if (status) { sql += ` AND t.status = $${idx++}`; params.push(status); }
    if (priority) { sql += ` AND t.priority = $${idx++}`; params.push(priority); }
    sql += ` ORDER BY t.created_at DESC`;

    const result = await query(sql, params);
    successResponse(res, result.rows);
  } catch (err) {
    errorResponse(res, 'Failed to fetch tasks', 'INTERNAL_ERROR', 500);
  }
});

// Helper: broadcast a task event to the project room.
// `(global as any).io` is wired up in src/server.ts after Socket.IO init.
// Wrapped in a try/catch because the io global may be undefined if a route
// is exercised before server-startup completes (e.g. integration tests
// that import this router directly without booting the HTTP server).
function emitTaskEvent(
  eventType: 'task-created' | 'task-updated' | 'task-deleted' | 'task-completed',
  task: Record<string, any>,
) {
  try {
    const io = (global as any).io;
    if (!io || !task?.project_id) return;
    io.to(`project:${task.project_id}`).emit(eventType, {
      type: eventType,
      task,
      at: new Date().toISOString(),
    });
  } catch {
    // Best-effort broadcast — never fail the HTTP response over a missed emit.
  }
}

router.post('/', authenticateToken, validate(taskSchema), async (req, res) => {
  try {
    const { projectId, title, description, assignedTo, priority, status, dueDate } = req.body;
    const userId = req.user!.id;

    // Verify project ownership if projectId provided
    if (projectId) {
      const check = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
      if (check.rows.length === 0) return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
    }

    const result = await query(
      `INSERT INTO tasks (project_id, title, description, assigned_to, priority, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [projectId || null, title, description || null, assignedTo || null, priority || 'medium', status || 'pending', dueDate || null]
    );
    emitTaskEvent('task-created', result.rows[0]);
    successResponse(res, result.rows[0], 201);
  } catch (err) {
    errorResponse(res, 'Failed to create task', 'INTERNAL_ERROR', 500);
  }
});

router.get('/:id', authenticateToken, validateParams(taskIdSchema), async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, p.name as project_name, p.user_id as project_owner_id FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return errorResponse(res, 'Task not found', 'NOT_FOUND', 404);
    successResponse(res, result.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to fetch task', 'INTERNAL_ERROR', 500);
  }
});

router.put('/:id', authenticateToken, validateParams(taskIdSchema), validate(taskSchema.partial()), async (req, res) => {
  try {
    const taskId = req.params.id;
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (req.body.title !== undefined) { updates.push(`title = $${idx++}`); values.push(req.body.title); }
    if (req.body.description !== undefined) { updates.push(`description = $${idx++}`); values.push(req.body.description); }
    if (req.body.assignedTo !== undefined) { updates.push(`assigned_to = $${idx++}`); values.push(req.body.assignedTo); }
    if (req.body.priority !== undefined) { updates.push(`priority = $${idx++}`); values.push(req.body.priority); }
    if (req.body.status !== undefined) { updates.push(`status = $${idx++}`); values.push(req.body.status); }
    if (req.body.dueDate !== undefined) { updates.push(`due_date = $${idx++}`); values.push(req.body.dueDate); }

    if (updates.length === 0) return errorResponse(res, 'No fields to update', 'VALIDATION_ERROR', 400);

    values.push(taskId);
    const sql = `UPDATE tasks SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) return errorResponse(res, 'Task not found', 'NOT_FOUND', 404);
    emitTaskEvent('task-updated', result.rows[0]);
    successResponse(res, result.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to update task', 'INTERNAL_ERROR', 500);
  }
});

router.delete('/:id', authenticateToken, validateParams(taskIdSchema), async (req, res) => {
  try {
    // Need project_id to know which room to broadcast to — fetch before delete.
    const before = await query('SELECT id, project_id FROM tasks WHERE id = $1', [req.params.id]);
    const result = await query('DELETE FROM tasks WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return errorResponse(res, 'Task not found', 'NOT_FOUND', 404);
    if (before.rows[0]) emitTaskEvent('task-deleted', before.rows[0]);
    successResponse(res, { message: 'Task deleted' });
  } catch (err) {
    errorResponse(res, 'Failed to delete task', 'INTERNAL_ERROR', 500);
  }
});

router.post('/:id/complete', authenticateToken, validateParams(taskIdSchema), async (req, res) => {
  try {
    const result = await query(
      `UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return errorResponse(res, 'Task not found', 'NOT_FOUND', 404);
    emitTaskEvent('task-completed', result.rows[0]);
    successResponse(res, result.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to complete task', 'INTERNAL_ERROR', 500);
  }
});

export { router as tasksRouter };
