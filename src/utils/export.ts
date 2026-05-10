import PDFDocument from 'pdfkit';
import { query } from '../config/database.js';

interface ExportContext {
  userId: string;
  projectId: string;
  projectName: string;
  companyName: string;
}

/**
 * Generate a project closeout package PDF.
 * Includes: project summary, drawing log, RFI log, submittal register,
 * daily log summary, defect/punch list, photo index.
 */
export async function generateCloseoutPackage(
  ctx: ExportContext
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50 });
  const buffers: Buffer[] = [];

  doc.on('data', (chunk: Buffer) => buffers.push(chunk));

  // ─── Title Page ───────────────────────────────────────────────────────
  doc.fontSize(24).text('Project Closeout Package', 50, 100);
  doc.fontSize(14).text(ctx.projectName, 50, 140);
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 50, 170);
  doc.fontSize(10).text(`Company: ${ctx.companyName || 'BuildTrack'}`, 50, 185);
  doc.addPage();

  // ─── Project Summary ────────────────────────────────────────────────────
  const project = await query(
    `SELECT * FROM projects WHERE id = $1 AND user_id = $2`,
    [ctx.projectId, ctx.userId]
  );
  if (project.rows.length > 0) {
    const p = project.rows[0];
    doc.fontSize(16).text('Project Summary', 50, 50);
    doc.fontSize(10)
      .text(`Name: ${p.name}`, 50, 80)
      .text(`Location: ${p.location || 'N/A'}`, 50, 95)
      .text(`Status: ${p.status}`, 50, 110)
      .text(`Progress: ${p.progress}%`, 50, 125)
      .text(`Budget: £${(p.budget || 0).toLocaleString()}`, 50, 140)
      .text(`Spent: £${(p.spent || 0).toLocaleString()}`, 50, 155)
      .text(`Start: ${p.start_date ? new Date(p.start_date).toLocaleDateString('en-GB') : 'N/A'}`, 50, 170)
      .text(`End: ${p.end_date ? new Date(p.end_date).toLocaleDateString('en-GB') : 'N/A'}`, 50, 185);
    doc.addPage();
  }

  // ─── Drawing Log ────────────────────────────────────────────────────────
  const drawings = await query(
    `SELECT * FROM drawings WHERE project_id = $1 ORDER BY created_at DESC`,
    [ctx.projectId]
  );
  if (drawings.rows.length > 0) {
    doc.fontSize(16).text('Drawing Log', 50, 50);
    let y = 80;
    drawings.rows.forEach((d: any) => {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.fontSize(10).text(`${d.title} — v${d.version || '1.0'} — ${d.status}${d.current ? ' (Current)' : ''}${d.superseded ? ' (Superseded)' : ''}`, 50, y);
      y += 15;
    });
    doc.addPage();
  }

  // ─── RFI Log ──────────────────────────────────────────────────────────
  const rfis = await query(
    `SELECT * FROM rfis WHERE project_id = $1 ORDER BY created_at DESC`,
    [ctx.projectId]
  );
  if (rfis.rows.length > 0) {
    doc.fontSize(16).text('RFI Log', 50, 50);
    let y = 80;
    rfis.rows.forEach((r: any) => {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.fontSize(10).text(`RFI: ${r.number || r.id.substring(0, 8)} — ${r.subject}`, 50, y);
      doc.fontSize(9).text(`Status: ${r.status} | Priority: ${r.priority} | Due: ${r.due_date ? new Date(r.due_date).toLocaleDateString('en-GB') : 'N/A'}`, 50, y + 12);
      y += 30;
    });
    doc.addPage();
  }

  // ─── Submittal Register ─────────────────────────────────────────────────
  const submittals = await query(
    `SELECT * FROM submittals WHERE project_id = $1 ORDER BY created_at DESC`,
    [ctx.projectId]
  );
  if (submittals.rows.length > 0) {
    doc.fontSize(16).text('Submittal Register', 50, 50);
    let y = 80;
    submittals.rows.forEach((s: any) => {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.fontSize(10).text(`${s.submittal_number} — ${s.title}`, 50, y);
      doc.fontSize(9).text(`Status: ${s.status} | Type: ${s.type} | Due: ${s.due_date ? new Date(s.due_date).toLocaleDateString('en-GB') : 'N/A'}`, 50, y + 12);
      y += 30;
    });
    doc.addPage();
  }

  // ─── Defect / Punch List ────────────────────────────────────────────────
  const defects = await query(
    `SELECT * FROM defects WHERE project_id = $1 ORDER BY created_at DESC`,
    [ctx.projectId]
  );
  if (defects.rows.length > 0) {
    doc.fontSize(16).text('Punch List', 50, 50);
    let y = 80;
    defects.rows.forEach((d: any) => {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.fontSize(10).text(`${d.title} — ${d.status} — ${d.severity}`, 50, y);
      if (d.location) doc.fontSize(9).text(`Location: ${d.location}`, 50, y + 12);
      y += d.location ? 28 : 15;
    });
    doc.addPage();
  }

  // ─── Daily Log Summary ──────────────────────────────────────────────────
  const dailyLogs = await query(
    `SELECT * FROM daily_reports WHERE project_id = $1 ORDER BY report_date DESC`,
    [ctx.projectId]
  );
  if (dailyLogs.rows.length > 0) {
    doc.fontSize(16).text('Daily Log Summary', 50, 50);
    let y = 80;
    dailyLogs.rows.slice(0, 30).forEach((dr: any) => {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.fontSize(10).text(`${new Date(dr.report_date).toLocaleDateString('en-GB')} — ${dr.submitted_by} — ${dr.status}`, 50, y);
      if (dr.work_completed) doc.fontSize(8).text(dr.work_completed.substring(0, 120), 50, y + 12);
      y += dr.work_completed ? 28 : 15;
    });
  }

  // ─── Footer / Audit ───────────────────────────────────────────────────
  doc.addPage();
  doc.fontSize(16).text('Export Audit Record', 50, 50);
  doc.fontSize(10)
    .text(`Exported by: ${ctx.userId}`, 50, 80)
    .text(`Timestamp: ${new Date().toISOString()}`, 50, 95)
    .text(`BuildTrack v2.0 — Construction Project Controls`, 50, 110)
    .text(`This document is an official project record.`, 50, 130);

  doc.end();

  return new Promise((resolve) => {
    doc.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
  });
}

/**
 * Generate a dispute evidence package: specific record + all linked records.
 */
export async function generateDisputePackage(
  ctx: ExportContext,
  recordType: string,
  recordId: string
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50 });
  const buffers: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => buffers.push(chunk));

  // Get the record
  let record: any = null;
  const tableMap: Record<string, string> = {
    rfi: 'rfis', submittal: 'submittals', drawing: 'drawings',
    defect: 'defects', 'daily-report': 'daily_reports', permit: 'permits',
  };
  const table = tableMap[recordType];
  if (table) {
    const result = await query(
      `SELECT * FROM ${table} WHERE id = $1`,
      [recordId]
    );
    record = result.rows[0];
  }

  // Get linked records
  const links = await query(
    `SELECT l.*, s.title as source_title, t.title as target_title
     FROM links l
     LEFT JOIN ${table} s ON l.source_id = s.id AND l.source_type = $2
     LEFT JOIN ${table} t ON l.target_id = t.id AND l.target_type = $2
     WHERE l.source_id = $1 OR l.target_id = $1`,
    [recordId, recordType]
  );

  // Title
  doc.fontSize(24).text('Dispute Evidence Package', 50, 100);
  doc.fontSize(14).text(`${recordType.toUpperCase()}: ${record?.title || record?.subject || recordId}`, 50, 140);
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 50, 170);
  doc.fontSize(10).text(`This package contains the complete record and all linked evidence.`, 50, 185);

  // Record detail
  if (record) {
    doc.addPage();
    doc.fontSize(16).text('Primary Record', 50, 50);
    let y = 80;
    Object.entries(record).forEach(([key, value]) => {
      if (value !== null && key !== 'password_hash' && key !== 'token') {
        if (y > 700) { doc.addPage(); y = 50; }
        doc.fontSize(9).text(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`, 50, y);
        y += 12;
      }
    });
  }

  // Linked records
  if (links.rows.length > 0) {
    doc.addPage();
    doc.fontSize(16).text('Linked Records', 50, 50);
    let y = 80;
    links.rows.forEach((link: any) => {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.fontSize(10).text(`${link.relation}: ${link.target_type || link.source_type}`, 50, y);
      y += 15;
    });
  }

  // Audit
  doc.addPage();
  doc.fontSize(16).text('Audit Trail', 50, 50);
  const auditLogs = await query(
    `SELECT * FROM audit_logs WHERE entity_id = $1 OR entity_type = $2 ORDER BY created_at DESC LIMIT 50`,
    [recordId, recordType]
  );
  let y = 80;
  auditLogs.rows.forEach((log: any) => {
    if (y > 700) { doc.addPage(); y = 50; }
    doc.fontSize(9).text(`${new Date(log.created_at).toLocaleDateString('en-GB')} — ${log.event_type} — ${log.user_id ? log.user_id.substring(0, 8) : 'system'}`, 50, y);
    y += 12;
  });

  doc.fontSize(8).text(`
    This document is generated from BuildTrack's immutable audit trail.
    It represents the official record as of ${new Date().toISOString()}.
  `, 50, y + 20);

  doc.end();

  return new Promise((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
  });
}

/**
 * Generate a lightweight CSV export for a table.
 */
export async function generateCSV(
  tableName: string,
  projectId: string,
  userId: string
): Promise<string> {
  const validTables = ['rfis', 'submittals', 'drawings', 'defects', 'daily_reports', 'permits', 'timesheets'];
  if (!validTables.includes(tableName)) {
    throw new Error('Invalid table for export');
  }

  const result = await query(
    `SELECT * FROM ${tableName} WHERE project_id = $1`,
    [projectId]
  );

  if (result.rows.length === 0) return '';

  const headers = Object.keys(result.rows[0]).join(',');
  const rows = result.rows.map((row: any) =>
    Object.values(row).map((v: any) => {
      if (v === null) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    }).join(',')
  ).join('\n');

  return `${headers}\n${rows}`;
}
