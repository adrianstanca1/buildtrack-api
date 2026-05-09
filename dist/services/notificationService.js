"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
exports.getUnreadCount = getUnreadCount;
exports.getRecentNotifications = getRecentNotifications;
exports.broadcastToProject = broadcastToProject;
exports.emitToUser = emitToUser;
const uuid_1 = require("uuid");
const database_js_1 = require("../config/database.js");
async function createNotification(data) {
    const { userId, title, body, type = 'general', relatedId } = data;
    const result = await (0, database_js_1.query)(`INSERT INTO notifications (id, user_id, title, body, type, related_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [(0, uuid_1.v4)(), userId, title, body || null, type, relatedId || null]);
    return result.rows[0];
}
async function getUnreadCount(userId) {
    const result = await (0, database_js_1.query)('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false', [userId]);
    return parseInt(result.rows[0].count);
}
async function getRecentNotifications(userId, limit = 50, unreadOnly = false) {
    let sql = 'SELECT * FROM notifications WHERE user_id = $1';
    const params = [userId];
    if (unreadOnly)
        sql += ' AND read = false';
    sql += ' ORDER BY created_at DESC LIMIT $2';
    params.push(limit);
    const result = await (0, database_js_1.query)(sql, params);
    return result.rows;
}
async function broadcastToProject(projectId, event, data) {
    const io = global.io;
    if (io) {
        io.to(`project:${projectId}`).emit(event, data);
    }
}
async function emitToUser(userId, event, data) {
    const io = global.io;
    if (!io)
        return;
    // Find socket by userId (requires tracking in connection handler)
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    for (const socket of sockets) {
        socket.emit(event, data);
    }
}
//# sourceMappingURL=notificationService.js.map