-- BuildTrack Database Schema
-- Run this first: psql -U postgres -c "CREATE DATABASE buildtrack;" && psql -d buildtrack -f sql/schema.sql

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────────────────
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
);

-- ─── Projects ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
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
);

-- ─── Tasks ─────────────────────────────────────────────────────────────────
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
);

-- ─── Workers ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
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
);

-- ─── Safety Incidents ────────────────────────────────────────────────────
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
);

-- ─── Inspections ─────────────────────────────────────────────────────────
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
);

-- ─── Notifications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  type VARCHAR(20) DEFAULT 'general' CHECK (type IN ('task', 'project', 'safety', 'team', 'general')),
  related_id UUID,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── Activity Logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── Project Workers (junction) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_workers (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (project_id, worker_id)
);

-- ─── Refresh Tokens ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_workers_user ON workers(user_id);
CREATE INDEX IF NOT EXISTS idx_incidents_project ON safety_incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_inspections_project ON inspections(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
