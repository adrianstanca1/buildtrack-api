"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const database_js_1 = require("../config/database.js");
const validate_js_1 = require("../middleware/validate.js");
const auth_js_1 = require("../middleware/auth.js");
const response_js_1 = require("../utils/response.js");
const router = (0, express_1.Router)();
exports.notificationsRouter = router;
const notificationIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
router.get('/', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const unreadOnly = req.query.unread === 'true';
        const type = req.query.type;
        let sql = 'SELECT * FROM notifications WHERE user_id = $1';
        const params = [userId];
        let idx = 2;
        if (unreadOnly) {
            sql += ` AND read = false`;
        }
        if (type) {
            sql += ` AND type = $${idx++}`;
            params.push(type);
        }
        sql += ` ORDER BY created_at DESC LIMIT 50`;
        const result = await (0, database_js_1.query)(sql, params);
        // Get unread count
        const countResult = await (0, database_js_1.query)('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false', [userId]);
        (0, response_js_1.successResponse)(res, {
            notifications: result.rows,
            unreadCount: parseInt(countResult.rows[0].count),
        });
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to fetch notifications', 'INTERNAL_ERROR', 500);
    }
});
router.put('/:id/read', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(notificationIdSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await (0, database_js_1.query)('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *', [req.params.id, userId]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Notification not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to mark notification as read', 'INTERNAL_ERROR', 500);
    }
});
router.put('/read-all', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        await (0, database_js_1.query)('UPDATE notifications SET read = true WHERE user_id = $1', [userId]);
        (0, response_js_1.successResponse)(res, { message: 'All notifications marked as read' });
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to mark all as read', 'INTERNAL_ERROR', 500);
    }
});
router.delete('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(notificationIdSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await (0, database_js_1.query)('DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, userId]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Notification not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, { message: 'Notification deleted' });
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to delete notification', 'INTERNAL_ERROR', 500);
    }
});
//# sourceMappingURL=notifications.js.map