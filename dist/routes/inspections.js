"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inspectionsRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const database_js_1 = require("../config/database.js");
const validate_js_1 = require("../middleware/validate.js");
const auth_js_1 = require("../middleware/auth.js");
const response_js_1 = require("../utils/response.js");
const router = (0, express_1.Router)();
exports.inspectionsRouter = router;
const inspectionSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid().optional(),
    title: zod_1.z.string().min(1, 'Title is required').max(255),
    inspectorName: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    status: zod_1.z.enum(['pending', 'passed', 'failed']).optional(),
    date: zod_1.z.string().datetime().optional(),
    findings: zod_1.z.array(zod_1.z.string()).optional(),
    photos: zod_1.z.array(zod_1.z.string().url()).optional(),
});
const inspectionIdSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
router.get('/', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const projectId = req.query.projectId;
        const status = req.query.status;
        let sql = `SELECT i.*, p.name as project_name FROM inspections i LEFT JOIN projects p ON i.project_id = p.id WHERE p.user_id = $1`;
        const params = [userId];
        let idx = 2;
        if (projectId) {
            sql += ` AND i.project_id = $${idx++}`;
            params.push(projectId);
        }
        if (status) {
            sql += ` AND i.status = $${idx++}`;
            params.push(status);
        }
        sql += ` ORDER BY i.date DESC`;
        const result = await (0, database_js_1.query)(sql, params);
        (0, response_js_1.successResponse)(res, result.rows);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to fetch inspections', 'INTERNAL_ERROR', 500);
    }
});
router.post('/', auth_js_1.authenticateToken, (0, validate_js_1.validate)(inspectionSchema), async (req, res) => {
    try {
        const { projectId, title, inspectorName, description, status, date, findings, photos } = req.body;
        const result = await (0, database_js_1.query)(`INSERT INTO inspections (project_id, title, inspector_name, description, status, date, findings, photos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [projectId || null, title, inspectorName || null, description || null, status || 'pending', date || new Date().toISOString(),
            JSON.stringify(findings || []), JSON.stringify(photos || [])]);
        (0, response_js_1.successResponse)(res, result.rows[0], 201);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to create inspection', 'INTERNAL_ERROR', 500);
    }
});
router.get('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(inspectionIdSchema), async (req, res) => {
    try {
        const result = await (0, database_js_1.query)('SELECT * FROM inspections WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Inspection not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to fetch inspection', 'INTERNAL_ERROR', 500);
    }
});
router.put('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(inspectionIdSchema), (0, validate_js_1.validate)(inspectionSchema.partial()), async (req, res) => {
    try {
        const updates = [];
        const values = [];
        let idx = 1;
        const fields = ['title', 'inspectorName', 'description', 'status', 'date', 'findings', 'photos'];
        const dbFields = ['title', 'inspector_name', 'description', 'status', 'date', 'findings', 'photos'];
        for (let i = 0; i < fields.length; i++) {
            const val = req.body[fields[i]];
            if (val !== undefined) {
                updates.push(`${dbFields[i]} = $${idx++}`);
                values.push(fields[i] === 'findings' || fields[i] === 'photos' ? JSON.stringify(val) : val);
            }
        }
        if (updates.length === 0)
            return (0, response_js_1.errorResponse)(res, 'No fields to update', 'VALIDATION_ERROR', 400);
        values.push(req.params.id);
        const sql = `UPDATE inspections SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
        const result = await (0, database_js_1.query)(sql, values);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Inspection not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to update inspection', 'INTERNAL_ERROR', 500);
    }
});
router.delete('/:id', auth_js_1.authenticateToken, (0, validate_js_1.validateParams)(inspectionIdSchema), async (req, res) => {
    try {
        const result = await (0, database_js_1.query)('DELETE FROM inspections WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0)
            return (0, response_js_1.errorResponse)(res, 'Inspection not found', 'NOT_FOUND', 404);
        (0, response_js_1.successResponse)(res, { message: 'Inspection deleted' });
    }
    catch (err) {
        (0, response_js_1.errorResponse)(res, 'Failed to delete inspection', 'INTERNAL_ERROR', 500);
    }
});
//# sourceMappingURL=inspections.js.map