import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[DB] DATABASE_URL not set. Using default local connection.');
}

export const pool = new Pool({
  connectionString: connectionString || 'postgresql://postgres:postgres@localhost:5432/buildtrack',
  // Connection pool settings
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err);
  process.exit(-1);
});

// Helper to run a query with automatic client release
export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DB] Executed query', { text: text.substring(0, 50), duration, rows: result.rowCount });
  }
  return result;
}

// Helper to run a query within a transaction
export async function transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Initialize database tables if they don't exist
export async function initDatabase() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
      avatar_url TEXT,
      company_name VARCHAR(255),
      phone VARCHAR(50),
      subscription_tier VARCHAR(20) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
      subscription_status VARCHAR(20) DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'past_due', 'cancelled', 'trialing')),
      stripe_customer_id VARCHAR(255),
      stripe_subscription_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      location VARCHAR(255),
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      budget DECIMAL(15,2) DEFAULT 0,
      spent DECIMAL(15,2) DEFAULT 0,
      progress INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
      status VARCHAR(20) DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on-hold', 'completed', 'cancelled')),
      start_date DATE,
      end_date DATE,
      color VARCHAR(7) DEFAULT '#2563eb',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      assigned_to UUID REFERENCES users(id),
      priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed')),
      due_date TIMESTAMP,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS workers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(30) DEFAULT 'laborer' CHECK (role IN ('foreman', 'electrician', 'plumber', 'carpenter', 'mason', 'laborer', 'engineer', 'safety-officer')),
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'off-duty', 'on-leave')),
      phone VARCHAR(50),
      email VARCHAR(255),
      hourly_rate DECIMAL(10,2) DEFAULT 0,
      weekly_hours INTEGER DEFAULT 0,
      certifications JSONB DEFAULT '[]',
      avatar_url TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS safety_incidents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      reported_by UUID REFERENCES users(id),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
      date TIMESTAMP DEFAULT NOW(),
      injuries INTEGER DEFAULT 0,
      witnesses JSONB DEFAULT '[]',
      photos JSONB DEFAULT '[]',
      status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS inspections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL,
      inspector_name VARCHAR(255),
      description TEXT,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed')),
      date TIMESTAMP DEFAULT NOW(),
      findings JSONB DEFAULT '[]',
      photos JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      body TEXT,
      type VARCHAR(20) DEFAULT 'general' CHECK (type IN ('task', 'project', 'safety', 'team', 'general')),
      related_id UUID,
      read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id UUID,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS project_workers (
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
      assigned_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (project_id, worker_id)
    )`,
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS team_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      trade VARCHAR(100),
      cscs_card VARCHAR(100),
      hourly_rate DECIMAL(10,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on-leave')),
      phone VARCHAR(50),
      email VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      po_number VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      vendor_name VARCHAR(255) NOT NULL,
      vendor_email VARCHAR(255),
      vendor_phone VARCHAR(50),
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'acknowledged', 'partially_delivered', 'delivered', 'invoiced', 'paid', 'cancelled')),
      items JSONB DEFAULT '[]',
      subtotal DECIMAL(15,2) DEFAULT 0,
      tax_rate DECIMAL(5,2) DEFAULT 0,
      tax_amount DECIMAL(15,2) DEFAULT 0,
      total DECIMAL(15,2) DEFAULT 0,
      delivery_date DATE,
      expected_delivery DATE,
      delivery_address TEXT,
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS equipment (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(30) DEFAULT 'other' CHECK (type IN ('excavator', 'bulldozer', 'crane', 'loader', 'dump_truck', 'mixer', 'generator', 'scaffold', 'scissor_lift', 'forklift', 'compactor', 'other')),
      make VARCHAR(100),
      model VARCHAR(100),
      serial_number VARCHAR(100),
      year INTEGER,
      status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'rented', 'on_site', 'under_maintenance', 'out_of_service', 'retired')),
      daily_rate DECIMAL(10,2) DEFAULT 0,
      purchase_price DECIMAL(15,2) DEFAULT 0,
      purchase_date DATE,
      insurance_expiry DATE,
      mot_expiry DATE,
      location VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS equipment_maintenance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      equipment_id UUID REFERENCES equipment(id) ON DELETE CASCADE,
      maintenance_type VARCHAR(30) DEFAULT 'routine' CHECK (maintenance_type IN ('routine', 'repair', 'inspection', 'calibration', 'replacement')),
      description TEXT NOT NULL,
      cost DECIMAL(10,2) DEFAULT 0,
      performed_by VARCHAR(255),
      performed_at TIMESTAMP,
      next_due DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS meetings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      meeting_type VARCHAR(50) DEFAULT 'other' CHECK (meeting_type IN ('safety_toolbox', 'standup', 'client_walkthrough', 'change_order', 'quality_review', 'progress_review', 'closeout', 'other')),
      scheduled_at TIMESTAMP,
      duration_minutes INTEGER,
      location VARCHAR(255),
      agenda TEXT,
      notes TEXT,
      status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS meeting_attendees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(100),
      email VARCHAR(255),
      present BOOLEAN DEFAULT FALSE,
      arrived_at TIMESTAMP,
      left_at TIMESTAMP,
      signature_url TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS timesheet_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
      entry_date DATE NOT NULL,
      hours_worked DECIMAL(5,2) NOT NULL CHECK (hours_worked >= 0),
      overtime_hours DECIMAL(5,2) DEFAULT 0 CHECK (overtime_hours >= 0),
      hourly_rate DECIMAL(10,2),
      overtime_rate DECIMAL(10,2),
      work_description TEXT,
      category VARCHAR(20) DEFAULT 'regular' CHECK (category IN ('regular', 'overtime', 'weekend', 'holiday', 'sick', 'leave')),
      status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected', 'paid')),
      approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
  ];

  for (const sql of tables) {
    await query(sql);
  }

  // Create indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to)',
    'CREATE INDEX IF NOT EXISTS idx_workers_user ON workers(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_incidents_project ON safety_incidents(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_inspections_project ON inspections(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_logs(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_team_members_project ON team_members(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_meetings_type ON meetings(meeting_type)',
    'CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status)',
    'CREATE INDEX IF NOT EXISTS idx_meetings_scheduled ON meetings(scheduled_at)',
    'CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting ON meeting_attendees(meeting_id)',
    'CREATE INDEX IF NOT EXISTS idx_equipment_user ON equipment(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_equipment_project ON equipment(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment(type)',
    'CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status)',
    'CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_equipment ON equipment_maintenance(equipment_id)',
    'CREATE INDEX IF NOT EXISTS idx_timesheet_project ON timesheet_entries(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_timesheet_worker ON timesheet_entries(worker_id)',
    'CREATE INDEX IF NOT EXISTS idx_timesheet_status ON timesheet_entries(status)',
    'CREATE INDEX IF NOT EXISTS idx_timesheet_date ON timesheet_entries(entry_date)',
    'CREATE INDEX IF NOT EXISTS idx_po_project ON purchase_orders(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_name)',
  ];

  for (const sql of indexes) {
    await query(sql);
  }

  console.log('[DB] Tables and indexes initialized');
}

// Seed sample data (for development only)
export async function seedDatabase() {
  const userCount = await query('SELECT COUNT(*) FROM users');
  if (parseInt(userCount.rows[0].count) > 0) {
    console.log('[DB] Database already seeded. Skipping.');
    return;
  }

  // Insert demo user
  const bcrypt = await import('bcryptjs');
  const passwordHash = await bcrypt.hash('demo1234', 12);
  await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, company_name, subscription_tier, subscription_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    ['demo@buildtrack.com', passwordHash, 'Demo', 'User', 'admin', 'BuildTrack Demo', 'pro', 'active']
  );

  const userResult = await query('SELECT id FROM users WHERE email = $1', ['demo@buildtrack.com']);
  const userId = userResult.rows[0].id;

  // Insert demo project
  await query(
    `INSERT INTO projects (user_id, name, description, location, budget, progress, status, start_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [userId, 'Downtown Office Complex', 'Construction of a 12-story office building in downtown', '123 Main St, City', 2500000, 45, 'active', '2024-01-15', '2025-06-30']
  );

  const projectResult = await query('SELECT id FROM projects WHERE name = $1', ['Downtown Office Complex']);
  const projectId = projectResult.rows[0].id;

  // Insert demo tasks
  const tasks = [
    ['Foundation excavation', 'Excavate and prepare foundation site', 'high', 'pending'],
    ['Pour concrete foundation', 'Pour reinforced concrete foundation', 'high', 'pending'],
    ['Install steel frame', 'Erect structural steel framework', 'medium', 'pending'],
    ['Electrical rough-in', 'Install electrical conduits and boxes', 'medium', 'pending'],
    ['Plumbing installation', 'Install main plumbing lines', 'low', 'pending'],
  ];
  for (const [title, desc, priority, status] of tasks) {
    await query(
      `INSERT INTO tasks (project_id, title, description, priority, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [projectId, title, desc, priority, status, new Date(Date.now() + 30 * 86400000)]
    );
  }

  // Insert demo workers
  const workers = [
    ['John Smith', 'foreman', '555-0101', 'john@example.com'],
    ['Mike Johnson', 'electrician', '555-0102', 'mike@example.com'],
    ['Sarah Williams', 'plumber', '555-0103', 'sarah@example.com'],
    ['David Brown', 'carpenter', '555-0104', 'david@example.com'],
    ['Lisa Davis', 'engineer', '555-0105', 'lisa@example.com'],
  ];
  for (const [name, role, phone, email] of workers) {
    await query(
      `INSERT INTO workers (user_id, name, role, phone, email, hourly_rate, weekly_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, name, role, phone, email, 25 + Math.floor(Math.random() * 30), 40]
    );
  }

  console.log('[DB] Sample data seeded');
}
