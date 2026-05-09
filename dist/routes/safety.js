"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safetyRouter = void 0;
const express_1 = require("express");
/**
 * @swagger
 * /api/safety:
 *   get:
 *     summary: List all safety incidents
 *     tags: [Safety]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of incidents
 *       401:
 *         description: Unauthorized
 */
const zod_1 = require("zod");
const database_js_1 = require("../config/database.js");
const validate_js_1 = require("../middleware/validate.js");
const auth_js_1 = require("../middleware/auth.js");
const response_js_1 = require("../utils/response.js");
const router = (0, express_1.Router)();
exports.safetyRouter = router;
const incidentSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid().optional(),
    title: zod_1.z.string().min(1, 'Title is required').max(255),
    description: zod_1.z.string().optional(),
    severity: zod_1.z.enum(['low', 'medium', 'high', 'critical']).optional(),
    date: zod_1.z.string().datetime().optional(),
    injuries: zod_1.z.number().min(0).optional(),
    witnesses: zod_1.z.array(zod_1.z.string()).optional(),
    photos: zod_1.z.array(zod_1.z.string().url()).optional(),
});
const incidentIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
router.get('/incidents', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const projectId = req.query.projectId;
        const severity = req.query.severity;
        const status = req.query.status;
        let sql = `SELECT si.*, p.name as project_name FROM safety_incidents si LEFT JOIN projects p ON si.project_id = p.id WHERE p.user_id = $1 OR si.reported_by = $1`;
        const params = [userId];
        let idx = 2;
        if (projectId) {
            sql += ` AND si.project_id = $${idx++}`;
            params.push(projectId);
        }
        if (severity) {
            sql += ` AND si.severity = $${idx++}`;
            params.push(severity);
        }
        if (status) {
            sql += ` AND si.status = $${idx++}`;
            params.push(status);
        }
        sql += ` ORDER BY si.date DESC`;
        const result = await (0, database_js_1.query)(sql, params);
        (0, response_js_1.successResponse)(res, result.rows);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to fetch incidents', 'INTERNAL_ERROR', 500);
    }
});
router.post('/incidents', auth_js_1.authenticateToken, (0, validate_js_1.validate)(incidentSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const { projectId, title, description, severity, date, injuries, witnesses, photos } = req.body;
        const result = await (0, database_js_1.query)(`INSERT INTO safety_incidents (project_id, reported_by, title, description, severity, date, injuries, witnesses, photos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`, [projectId || null, userId, title, description || null, severity || 'medium', date || new Date().toISOString(),
            injuries || 0, JSON.stringify(witnesses || []), JSON.stringify(photos || [])]);
        (0, response_js_1.successResponse)(res, result.rows[0], 201);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to create incident', 'INTERNAL_ERROR', 500);
    }
});
router.get('/incidents/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(incidentIdSchema), async (req, res) => {
    try {
        const result = await (0, database_js_1.query)(`SELECT si.*, p.name as project_name FROM safety_incidents si LEFT JOIN projects p ON si.project_id = p.id WHERE si.id = $1`, [req.params.id]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Incident not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to fetch incident', 'INTERNAL_ERROR', 500);
    }
});
router.put('/incidents/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(incidentIdSchema), (0, validate_js_1.validate)(incidentSchema.partial()), async (req, res) => {
    try {
        const updates = [];
        const values = [];
        let idx = 1;
        const fields = ['title', 'description', 'severity', 'date', 'injuries', 'witnesses', 'photos'];
        const dbFields = ['title', 'description', 'severity', 'date', 'injuries', 'witnesses', 'photos'];
        for (let i = 0; i < fields.length; i++) {
            const val = req.body[fields[i]];
            if (val !== undefined) {
                updates.push(`${dbFields[i]} = $${idx++}`);
                values.push(fields[i] === 'witnesses' || fields[i] === 'photos' ? JSON.stringify(val) : val);
            }
        }
        if (updates.length === 0)
            return (0, response_js_1.errorResponse)(res, 'No fields to update', 'VALIDATION_ERROR', 400);
        values.push(req.params.id);
        const sql = `UPDATE safety_incidents SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
        const result = await (0, database_js_1.query)(sql, values);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Incident not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to update incident', 'INTERNAL_ERROR', 500);
    }
});
router.delete('/incidents/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(incidentIdSchema), async (req, res) => {
    try {
        const result = await (0, database_js_1.query)('DELETE FROM safety_incidents WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Incident not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, { message: 'Incident deleted' });
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to delete incident', 'INTERNAL_ERROR', 500);
    }
});
//# sourceMappingURL=safety.js.map