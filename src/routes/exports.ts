import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateParams } from '../middleware/validate.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { generateCloseoutPackage, generateDisputePackage, generateCSV } from '../utils/export.js';

const router = Router();

const exportSchema = z.object({ id: z.string().uuid() });

// ─── Export Closeout Package ──────────────────────────────────────────────
router.get('/projects/:id/closeout', authenticateToken, validateParams(exportSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const projectId = req.params.id;

    const projectCheck = await query(
      'SELECT id, name FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) {
      return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
    }

    const user = await query('SELECT company_name FROM users WHERE id = $1', [userId]);

    const pdf = await generateCloseoutPackage({
      userId,
      projectId,
      projectName: projectCheck.rows[0].name,
      companyName: user.rows[0]?.company_name || 'BuildTrack',
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${projectCheck.rows[0].name.replace(/\s+/g, '_')}_Closeout.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[Exports] Closeout error:', err);
    errorResponse(res, 'Failed to generate closeout package', 'INTERNAL_ERROR', 500);
  }
});

// ─── Export Dispute Evidence ──────────────────────────────────────────────
router.get('/projects/:id/dispute/:recordType/:recordId', authenticateToken, validateParams(exportSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const projectId = req.params.id;
    const recordType = req.params.recordType;
    const recordId = req.params.recordId;

    const validTypes = ['rfi', 'submittal', 'drawing', 'defect', 'daily-report', 'permit'];
    if (!validTypes.includes(recordType)) {
      return errorResponse(res, 'Invalid record type', 'VALIDATION_ERROR', 400);
    }

    const projectCheck = await query(
      'SELECT id, name FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) {
      return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
    }

    const user = await query('SELECT company_name FROM users WHERE id = $1', [userId]);

    const pdf = await generateDisputePackage(
      {
        userId,
        projectId,
        projectName: projectCheck.rows[0].name,
        companyName: user.rows[0]?.company_name || 'BuildTrack',
      },
      recordType,
      recordId
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${recordType}_${recordId.substring(0, 8)}_Evidence.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('[Exports] Dispute export error:', err);
    errorResponse(res, 'Failed to generate dispute package', 'INTERNAL_ERROR', 500);
  }
});

// ─── Export CSV ───────────────────────────────────────────────────────────
router.get('/projects/:id/csv/:table', authenticateToken, validateParams(exportSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const projectId = req.params.id;
    const tableName = req.params.table;

    const projectCheck = await query(
      'SELECT id FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (projectCheck.rows.length === 0) {
      return errorResponse(res, 'Project not found', 'NOT_FOUND', 404);
    }

    const csv = await generateCSV(tableName, projectId, userId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${tableName}_${projectId.substring(0, 8)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[Exports] CSV error:', err);
    errorResponse(res, 'Failed to generate CSV', 'INTERNAL_ERROR', 500);
  }
});

export { router as exportsRouter };
