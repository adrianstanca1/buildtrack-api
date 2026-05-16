import { Pool } from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/buildtrack_test';

export const testPool = new Pool({
  connectionString: TEST_DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function initTestDatabase() {
  const client = await testPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
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
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
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
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
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
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS workers (
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
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS safety_incidents (
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
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS inspections (
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
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        type VARCHAR(20) DEFAULT 'general' CHECK (type IN ('task', 'project', 'safety', 'team', 'general')),
        related_id UUID,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS project_workers (
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (project_id, worker_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(100) NOT NULL,
        ip_address INET,
        user_agent TEXT,
        success BOOLEAN DEFAULT TRUE,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } finally {
    client.release();
  }

  // Also run the production initDatabase() against the test DB so tables
  // defined there (purchase_orders, meetings, materials, equipment,
  // change_orders, budget_categories, cost_entries, schedules,
  // timesheet_entries, etc.) exist for route-level tests. The
  // function-local pool inside src/config/database uses DATABASE_URL,
  // which the jest setupFiles point at TEST_DATABASE_URL — so
  // initDatabase() lands in buildtrack_test, not production. All
  // statements use CREATE TABLE IF NOT EXISTS so re-running on top of
  // the 12 tables created above is a no-op for those.
  const { initDatabase } = await import('../../src/config/database');
  await initDatabase();
}

export async function cleanTestDatabase() {
  // DELETE rather than TRUNCATE: less aggressive lock (ROW EXCLUSIVE
  // vs ACCESS EXCLUSIVE) so we don't deadlock against the API pool's
  // idle connections from prior tests. Order: deepest dependents first
  // to respect FKs without CASCADE.
  const client = await testPool.connect();
  try {
    await client.query('DELETE FROM password_reset_tokens');
    await client.query('DELETE FROM audit_logs');
    await client.query('DELETE FROM project_workers');
    await client.query('DELETE FROM refresh_tokens');
    await client.query('DELETE FROM activity_logs');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM inspections');
    await client.query('DELETE FROM safety_incidents');
    await client.query('DELETE FROM tasks');
    await client.query('DELETE FROM workers');
    await client.query('DELETE FROM projects');
    await client.query('DELETE FROM users');
  } finally {
    client.release();
  }
}

export async function closeTestDatabase() {
  await testPool.end();
}
