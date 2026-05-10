import { query } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export interface AuditEvent {
  userId?: string;
  eventType: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  details?: Record<string, any>;
}

export async function auditLog(event: AuditEvent) {
  try {
    await query(
      `INSERT INTO audit_logs (id, user_id, event_type, ip_address, user_agent, success, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        uuidv4(),
        event.userId || null,
        event.eventType,
        event.ipAddress || null,
        event.userAgent || null,
        event.success,
        event.details ? JSON.stringify(event.details) : null,
      ]
    );
  } catch (err) {
    console.error('[Audit] Failed to log event:', err);
  }
}
