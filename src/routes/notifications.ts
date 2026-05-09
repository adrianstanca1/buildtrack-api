import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { validateParams } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';

const router = Router();

const notificationIdSchema = z.object({ id: z.string().uuid() });

router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    const unreadOnly = req.query.unread === 'true';
    const type = req.query.type as string;

    let sql = 'SELECT * FROM notifications WHERE user_id = $1';
    const params: any[] = [userId];
    let idx = 2;

    if (unreadOnly) { sql += ` AND read = false`; }
    if (type) { sql += ` AND type = $${idx++}`; params.push(type); }
    sql += ` ORDER BY created_at DESC LIMIT 50`;

    const result = await query(sql, params);

    // Get unread count
    const countResult = await query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false', [userId]);

    successResponse(res, {
      notifications: result.rows,
      unreadCount: parseInt(countResult.rows[0].count),
    });
  } catch (err) {
    errorResponse(res, 'Failed to fetch notifications', 'INTERNAL_ERROR', 500);
  }
});

router.put('/:id/read', authenticateToken, validateParams(notificationIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query(
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, userId]
    );
    if (result.rows.length === 0) return errorResponse(res, 'Notification not found', 'NOT_FOUND', 404);
    successResponse(res, result.rows[0]);
  } catch (err) {
    errorResponse(res, 'Failed to mark notification as read', 'INTERNAL_ERROR', 500);
  }
});

router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    await query('UPDATE notifications SET read = true WHERE user_id = $1', [userId]);
    successResponse(res, { message: 'All notifications marked as read' });
  } catch (err) {
    errorResponse(res, 'Failed to mark all as read', 'INTERNAL_ERROR', 500);
  }
});

router.delete('/:id', authenticateToken, validateParams(notificationIdSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const result = await query('DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, userId]);
    if (result.rows.length === 0) return errorResponse(res, 'Notification not found', 'NOT_FOUND', 404);
    successResponse(res, { message: 'Notification deleted' });
  } catch (err) {
    errorResponse(res, 'Failed to delete notification', 'INTERNAL_ERROR', 500);
  }
});

export { router as notificationsRouter };
