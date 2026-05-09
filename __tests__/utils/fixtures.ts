import { v4 as uuidv4 } from 'uuid';
import { query } from '../../src/config/database.js';
import bcrypt from 'bcryptjs';

export interface TestUserData {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
  companyName?: string;
}

export async function createTestUser(data: Partial<TestUserData> = {}) {
  const id = data.id || uuidv4();
  const password = data.password || 'TestPassword123!';
  const passwordHash = await bcrypt.hash(password, 12);

  const result = await query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, company_name, subscription_tier, subscription_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      data.email || `test-${id.slice(0, 8)}@example.com`,
      passwordHash,
      data.firstName || 'Test',
      data.lastName || 'User',
      data.role || 'user',
      data.companyName || 'Test Company',
      'free',
      'active',
    ]
  );

  return { ...result.rows[0], plainPassword: password };
}

export async function createTestProject(userId: string, data: any = {}) {
  const result = await query(
    `INSERT INTO projects (user_id, name, description, location, latitude, longitude, budget, status, start_date, end_date, color)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      userId,
      data.name || 'Test Project',
      data.description || 'A test project',
      data.location || '123 Test St',
      data.latitude || 40.7128,
      data.longitude || -74.0060,
      data.budget || 100000,
      data.status || 'planning',
      data.startDate || new Date().toISOString(),
      data.endDate || new Date(Date.now() + 30 * 86400000).toISOString(),
      data.color || '#2563eb',
    ]
  );
  return result.rows[0];
}

export async function createTestTask(projectId: string, data: any = {}) {
  const result = await query(
    `INSERT INTO tasks (project_id, title, description, assigned_to, priority, status, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      projectId,
      data.title || 'Test Task',
      data.description || 'A test task',
      data.assignedTo || null,
      data.priority || 'medium',
      data.status || 'pending',
      data.dueDate || new Date(Date.now() + 7 * 86400000).toISOString(),
    ]
  );
  return result.rows[0];
}

export async function createTestWorker(userId: string, data: any = {}) {
  const result = await query(
    `INSERT INTO workers (user_id, name, role, status, phone, email, hourly_rate, weekly_hours, certifications, avatar_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      userId,
      data.name || 'John Worker',
      data.role || 'laborer',
      data.status || 'active',
      data.phone || '555-0100',
      data.email || `worker-${uuidv4().slice(0, 8)}@example.com`,
      data.hourlyRate || 25,
      data.weeklyHours || 40,
      JSON.stringify(data.certifications || []),
      data.avatarUrl || null,
    ]
  );
  return result.rows[0];
}

export async function createTestIncident(userId: string, projectId?: string, data: any = {}) {
  const result = await query(
    `INSERT INTO safety_incidents (project_id, reported_by, title, description, severity, date, injuries, witnesses, photos, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      projectId || null,
      userId,
      data.title || 'Test Incident',
      data.description || 'A test safety incident',
      data.severity || 'medium',
      data.date || new Date().toISOString(),
      data.injuries || 0,
      JSON.stringify(data.witnesses || []),
      JSON.stringify(data.photos || []),
      data.status || 'open',
    ]
  );
  return result.rows[0];
}

export async function createTestInspection(projectId?: string, data: any = {}) {
  const result = await query(
    `INSERT INTO inspections (project_id, title, inspector_name, description, status, date, findings, photos)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      projectId || null,
      data.title || 'Test Inspection',
      data.inspectorName || 'Inspector Smith',
      data.description || 'A test inspection',
      data.status || 'pending',
      data.date || new Date().toISOString(),
      JSON.stringify(data.findings || []),
      JSON.stringify(data.photos || []),
    ]
  );
  return result.rows[0];
}

export async function createTestNotification(userId: string, data: any = {}) {
  const result = await query(
    `INSERT INTO notifications (user_id, title, body, type, related_id, read)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      userId,
      data.title || 'Test Notification',
      data.body || 'This is a test notification',
      data.type || 'general',
      data.relatedId || null,
      data.read || false,
    ]
  );
  return result.rows[0];
}

export async function createTestRefreshToken(userId: string, token: string, expiresAt?: Date) {
  const result = await query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [
      userId,
      token,
      expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ]
  );
  return result.rows[0];
}
