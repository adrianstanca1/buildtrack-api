import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';

export async function createNotification(data: {
  userId: string;
  title: string;
  body?: string;
  type?: string;
  relatedId?: string;
}) {
  const { userId, title, body, type = 'general', relatedId } = data;
  const result = await query(
    `INSERT INTO notifications (id, user_id, title, body, type, related_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [uuidv4(), userId, title, body || null, type, relatedId || null]
  );
  return result.rows[0];
}

export async function getUnreadCount(userId: string) {
  const result = await query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false',
    [userId]
  );
  return parseInt(result.rows[0].count);
}

export async function getRecentNotifications(userId: string, limit = 50, unreadOnly = false) {
  let sql = 'SELECT * FROM notifications WHERE user_id = $1';
  const params: any[] = [userId];

  if (unreadOnly) sql += ' AND read = false';
  sql += ' ORDER BY created_at DESC LIMIT $2';
  params.push(limit);

  const result = await query(sql, params);
  return result.rows;
}

export async function broadcastToProject(projectId: string, event: string, data: any) {
  const io = (global as any).io;
  if (io) {
    io.to(`project:${projectId}`).emit(event, data);
  }
}

export async function emitToUser(userId: string, event: string, data: any) {
  const io = (global as any).io;
  if (!io) return;

  // Find socket by userId (requires tracking in connection handler)
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  for (const socket of sockets) {
    socket.emit(event, data);
  }
}
