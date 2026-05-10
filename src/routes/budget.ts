import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../config/database.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { paginatedResponse, successResponse } from '../utils/response.js';
import { auditLog } from '../utils/audit.js';

const router = Router();

const categorySchema = z.object({
  projectId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  code: z.string().optional(),
  description: z.string().optional(),
  budgetAmount: z.number().min(0).optional(),
  contingencyPercent: z.number().min(0).max(100).optional(),
});

const costEntrySchema = z.object({
  projectId: z.string().uuid().optional(),
  budgetCategoryId: z.string().uuid().optional(),
  entryType: z.enum(['budget', 'actual', 'forecast', 'commitment', 'variance']).optional(),
  description: z.string().optional(),
  amount: z.number().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  vendor: z.string().optional(),
  costCode: z.string().optional(),
  date: z.string().optional(),
  linkedPoId: z.string().uuid().optional(),
  linkedCoId: z.string().uuid().optional(),
  linkedInvoiceId: z.string().uuid().optional(),
  linkedTimesheetId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const updateCategorySchema = categorySchema.partial();
const updateCostEntrySchema = costEntrySchema.partial();

// ─── Budget Categories ──────────────────────────────────────

router.get('/categories', optionalAuth, async (req, res, next) => {
  try {
    const { projectId } = req.query;
    let sql = 'SELECT * FROM budget_categories WHERE 1=1';
    const params: any[] = [];
    if (projectId) { params.push(projectId); sql += ` AND project_id = $${params.length}`; }
    sql += ' ORDER BY name';
    const { rows } = await query(sql, params);
    successResponse(res, rows);
  } catch (err) { next(err); }
});

router.post('/categories', authenticateToken, validate(categorySchema), async (req, res, next) => {
  try {
    const d = req.body;
    const id = uuidv4();
    const { rows } = await query(
      `INSERT INTO budget_categories (id, project_id, name, code, description, budget_amount, contingency_percent)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, d.projectId||null, d.name, d.code||null, d.description||null, d.budgetAmount||0, d.contingencyPercent||0]
    );
    await auditLog({ eventType:'budget_category_created', userId: (req as any).user?.id, success: true, details: { categoryId: id } });
    successResponse(res, rows[0], 201);
  } catch (err) { next(err); }
});

router.patch('/categories/:id', authenticateToken, validate(updateCategorySchema), async (req, res, next) => {
  try {
    const d = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    const add = (col: string, val: any) => { if (val !== undefined) { fields.push(`${col} = $${fields.length + 2}`); values.push(val); } };
    add('project_id', d.projectId);
    add('name', d.name);
    add('code', d.code);
    add('description', d.description);
    add('budget_amount', d.budgetAmount);
    add('contingency_percent', d.contingencyPercent);
    if (fields.length === 0) return res.status(400).json({ success: false, error: { message: 'No fields', code: 'BAD_REQUEST' } });
    const { rows } = await query(
      `UPDATE budget_categories SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    successResponse(res, rows[0]);
  } catch (err) { next(err); }
});

router.delete('/categories/:id', authenticateToken, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM budget_categories WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
    successResponse(res, null);
  } catch (err) { next(err); }
});

// ─── Cost Entries ────────────────────────────────────────────

router.get('/costs', optionalAuth, async (req, res, next) => {
  try {
    const { projectId, categoryId, entryType, dateFrom, dateTo, page = '1', limit = '50' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
    const offset = (pageNum - 1) * limitNum;

    let sql = 'SELECT ce.*, bc.name as category_name FROM cost_entries ce LEFT JOIN budget_categories bc ON ce.budget_category_id = bc.id WHERE 1=1';
    let countSql = 'SELECT COUNT(*) FROM cost_entries ce WHERE 1=1';
    const params: any[] = [];

    if (projectId) { params.push(projectId); sql += ` AND ce.project_id = $${params.length}`; countSql += ` AND ce.project_id = $${params.length}`; }
    if (categoryId) { params.push(categoryId); sql += ` AND ce.budget_category_id = $${params.length}`; countSql += ` AND ce.budget_category_id = $${params.length}`; }
    if (entryType) { params.push(entryType); sql += ` AND ce.entry_type = $${params.length}`; countSql += ` AND ce.entry_type = $${params.length}`; }
    if (dateFrom) { params.push(dateFrom); sql += ` AND ce.date >= $${params.length}`; countSql += ` AND ce.date >= $${params.length}`; }
    if (dateTo) { params.push(dateTo); sql += ` AND ce.date <= $${params.length}`; countSql += ` AND ce.date <= $${params.length}`; }

    sql += ' ORDER BY ce.date DESC, ce.created_at DESC';
    params.push(limitNum, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const { rows: items } = await query(sql, params);
    const { rows: countRows } = await query(countSql, params.slice(0, -2));
    const total = parseInt(countRows[0].count);

    paginatedResponse(res, items, total, pageNum, limitNum);
  } catch (err) { next(err); }
});

router.post('/costs', authenticateToken, validate(costEntrySchema), async (req, res, next) => {
  try {
    const d = req.body;
    const id = uuidv4();
    const { rows } = await query(
      `INSERT INTO cost_entries (id, project_id, budget_category_id, entry_type, description, amount, quantity, unit, vendor, cost_code, date, linked_po_id, linked_co_id, linked_invoice_id, linked_timesheet_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [id, d.projectId||null, d.budgetCategoryId||null, d.entryType||'actual', d.description||null, d.amount||0, d.quantity||1, d.unit||null, d.vendor||null, d.costCode||null, d.date||null, d.linkedPoId||null, d.linkedCoId||null, d.linkedInvoiceId||null, d.linkedTimesheetId||null, d.notes||null, (req as any).user?.id||null]
    );
    await auditLog({ eventType:'cost_entry_created', userId: (req as any).user?.id, success: true, details: { costEntryId: id } });
    successResponse(res, rows[0], 201);
  } catch (err) { next(err); }
});

router.patch('/costs/:id', authenticateToken, validate(updateCostEntrySchema), async (req, res, next) => {
  try {
    const d = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    const add = (col: string, val: any) => { if (val !== undefined) { fields.push(`${col} = $${fields.length + 2}`); values.push(val); } };
    add('project_id', d.projectId);
    add('budget_category_id', d.budgetCategoryId);
    add('entry_type', d.entryType);
    add('description', d.description);
    add('amount', d.amount);
    add('quantity', d.quantity);
    add('unit', d.unit);
    add('vendor', d.vendor);
    add('cost_code', d.costCode);
    add('date', d.date);
    add('notes', d.notes);
    if (fields.length === 0) return res.status(400).json({ success: false, error: { message: 'No fields', code: 'BAD_REQUEST' } });
    const { rows } = await query(`UPDATE cost_entries SET ${fields.join(', ')} WHERE id = $1 RETURNING *`, [req.params.id, ...values]);
    successResponse(res, rows[0]);
  } catch (err) { next(err); }
});

router.delete('/costs/:id', authenticateToken, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM cost_entries WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ success: false, error: { message: 'Not found', code: 'NOT_FOUND' } });
    successResponse(res, null);
  } catch (err) { next(err); }
});

// ─── Project Budget Summary ──────────────────────────────────

router.get('/summary/:projectId', optionalAuth, async (req, res, next) => {
  try {
    const projectId = req.params.projectId;
    const { rows: budgetRows } = await query(`
      SELECT COALESCE(SUM(budget_amount), 0) as total_budget,
             COALESCE(SUM(budget_amount * (1 + contingency_percent/100)), 0) as total_with_contingency
      FROM budget_categories WHERE project_id = $1`, [projectId]);

    const { rows: costRows } = await query(`
      SELECT entry_type, COALESCE(SUM(amount), 0) as total
      FROM cost_entries WHERE project_id = $1
      GROUP BY entry_type`, [projectId]);

    const summary = {
      projectId,
      totalBudget: parseFloat(budgetRows[0]?.total_budget || 0),
      totalWithContingency: parseFloat(budgetRows[0]?.total_with_contingency || 0),
      actual: parseFloat(costRows.find((r: any) => r.entry_type === 'actual')?.total || 0),
      forecast: parseFloat(costRows.find((r: any) => r.entry_type === 'forecast')?.total || 0),
      commitment: parseFloat(costRows.find((r: any) => r.entry_type === 'commitment')?.total || 0),
      variance: parseFloat(costRows.find((r: any) => r.entry_type === 'variance')?.total || 0),
    };

    summary.variance = summary.totalBudget - summary.actual;

    successResponse(res, summary);
  } catch (err) { next(err); }
});

export { router as budgetRouter };
