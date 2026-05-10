-- =============================================================================
-- BuildTrack CortexBuild Integration Migration
-- Generated: 2026-05-10
-- Database: buildtrack_api
--
-- Purpose: Adds tables from cortexbuild-field that are missing in BuildTrack.
-- Tables: defects, permits, timesheets, team_members, rfis, drawings,
--          drawing_pins, daily_reports, invoices
-- =============================================================================

-- Enable UUID extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. DEFECTS (snagging / punch list)
-- =============================================================================

CREATE TABLE IF NOT EXISTS defects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  location VARCHAR(255),
  trade VARCHAR(100),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'disputed')),
  assigned_to VARCHAR(255),
  reported_by VARCHAR(255) NOT NULL,
  due_date TIMESTAMP,
  resolved_at TIMESTAMP,
  photo_urls JSONB DEFAULT '[]',
  ai_analysis TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE defects IS 'Construction defect / snag tracking — records snags, punch-list items, and quality issues per project.';

CREATE INDEX IF NOT EXISTS idx_defects_project ON defects(project_id);
CREATE INDEX IF NOT EXISTS idx_defects_status ON defects(status);
CREATE INDEX IF NOT EXISTS idx_defects_priority ON defects(priority);
CREATE INDEX IF NOT EXISTS idx_defects_assigned ON defects(assigned_to);

-- =============================================================================
-- 2. PERMITS TO WORK
-- =============================================================================

CREATE TABLE IF NOT EXISTS permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('hot_work', 'confined_space', 'excavation', 'working_at_height', 'electrical', 'general')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'active', 'expired', 'cancelled')),
  location VARCHAR(255),
  issued_by VARCHAR(255),
  issued_to VARCHAR(255),
  valid_from TIMESTAMP,
  valid_to TIMESTAMP,
  conditions TEXT,
  risk_level VARCHAR(20) DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE permits IS 'Work permits (PTW) — tracks hot work, confined space, excavation, height, electrical, and general permits per project.';

CREATE INDEX IF NOT EXISTS idx_permits_project ON permits(project_id);
CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status);
CREATE INDEX IF NOT EXISTS idx_permits_type ON permits(type);
CREATE INDEX IF NOT EXISTS idx_permits_risk ON permits(risk_level);
CREATE INDEX IF NOT EXISTS idx_permits_valid ON permits(valid_from, valid_to);

-- =============================================================================
-- 3. TIMESHEETS (weekly hour logging with approval workflow)
-- =============================================================================

CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name VARCHAR(255),
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  worker_name VARCHAR(255) NOT NULL,
  week_starting VARCHAR(20) NOT NULL, -- YYYY-MM-DD
  monday_hours DECIMAL(5,2) DEFAULT 0,
  tuesday_hours DECIMAL(5,2) DEFAULT 0,
  wednesday_hours DECIMAL(5,2) DEFAULT 0,
  thursday_hours DECIMAL(5,2) DEFAULT 0,
  friday_hours DECIMAL(5,2) DEFAULT 0,
  saturday_hours DECIMAL(5,2) DEFAULT 0,
  sunday_hours DECIMAL(5,2) DEFAULT 0,
  total_hours DECIMAL(6,2) DEFAULT 0,
  overtime_hours DECIMAL(6,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at TIMESTAMP,
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE timesheets IS 'Weekly timesheet records per worker — tracks daily hours, overtime, and approval workflow (draft → submitted → approved/rejected).';

CREATE INDEX IF NOT EXISTS idx_timesheets_project ON timesheets(project_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_worker ON timesheets(worker_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheets_week ON timesheets(week_starting);

-- =============================================================================
-- 4. TEAM MEMBERS (worker assignment to projects)
-- =============================================================================

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100) NOT NULL,
  trade VARCHAR(100),
  email VARCHAR(320),
  phone VARCHAR(30),
  cscs_card_type VARCHAR(100),
  cscs_expiry TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on_leave')),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  hourly_rate DECIMAL(8,2),
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE team_members IS 'Team members / subcontractors — tracks CSCS details, trade, hourly rate, and project assignment.';

CREATE INDEX IF NOT EXISTS idx_team_members_project ON team_members(project_id);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status);
CREATE INDEX IF NOT EXISTS idx_team_members_trade ON team_members(trade);

-- =============================================================================
-- 5. RFIs (Requests for Information)
-- =============================================================================

CREATE TABLE IF NOT EXISTS rfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  raised_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  number VARCHAR(50),
  subject VARCHAR(255) NOT NULL,
  question TEXT NOT NULL,
  response TEXT,
  status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'open', 'answered', 'approved', 'rejected', 'closed')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date VARCHAR(20), -- YYYY-MM-DD
  attachment_urls JSONB DEFAULT '[]',
  answered_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  responded_at TIMESTAMP,
  approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  rejected_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMP,
  rejected_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE rfis IS 'Requests for Information — formal Q&A workflow between contractors, architects, and clients per project.';

CREATE INDEX IF NOT EXISTS idx_rfis_project ON rfis(project_id);
CREATE INDEX IF NOT EXISTS idx_rfis_status ON rfis(status);
CREATE INDEX IF NOT EXISTS idx_rfis_priority ON rfis(priority);
CREATE INDEX IF NOT EXISTS idx_rfis_raised_by ON rfis(raised_by_id);

-- =============================================================================
-- 6. DRAWINGS (document vault for architectural / structural drawings)
-- =============================================================================

CREATE TABLE IF NOT EXISTS drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  uploaded_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  drawing_number VARCHAR(100),
  revision VARCHAR(20),
  discipline VARCHAR(100),
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_size INTEGER,
  status VARCHAR(20) DEFAULT 'current' CHECK (status IN ('current', 'superseded', 'archived')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE drawings IS 'Drawing document vault — stores architectural, structural, and MEP drawings with revision tracking per project.';

CREATE INDEX IF NOT EXISTS idx_drawings_project ON drawings(project_id);
CREATE INDEX IF NOT EXISTS idx_drawings_status ON drawings(status);
CREATE INDEX IF NOT EXISTS idx_drawings_discipline ON drawings(discipline);

-- =============================================================================
-- 7. DRAWING PINS (annotation markers on drawings — shared across devices)
-- =============================================================================

CREATE TABLE IF NOT EXISTS drawing_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id UUID REFERENCES drawings(id) ON DELETE CASCADE NOT NULL,
  drawing_number VARCHAR(255),
  pin_type VARCHAR(20) NOT NULL DEFAULT 'note' CHECK (pin_type IN ('defect', 'rfi', 'note')),
  x_pct DECIMAL(6,4) NOT NULL,
  y_pct DECIMAL(6,4) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assigned_to VARCHAR(255),
  photo_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE drawing_pins IS 'Drawing annotation pins — persistent markers (defects, RFIs, notes) placed on drawing images, synced across devices.';

CREATE INDEX IF NOT EXISTS idx_drawing_pins_drawing ON drawing_pins(drawing_id);
CREATE INDEX IF NOT EXISTS idx_drawing_pins_status ON drawing_pins(status);
CREATE INDEX IF NOT EXISTS idx_drawing_pins_type ON drawing_pins(pin_type);

-- =============================================================================
-- 8. DAILY REPORTS (site diary / daily construction reports)
-- =============================================================================

CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  report_date TIMESTAMP NOT NULL,
  weather VARCHAR(100),
  temperature INTEGER,
  workers_on_site INTEGER DEFAULT 0,
  work_completed TEXT,
  materials_used TEXT,
  equipment_used TEXT,
  issues_delays TEXT,
  safety_observations TEXT,
  next_day_plan TEXT,
  photo_urls JSONB DEFAULT '[]',
  submitted_by VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE daily_reports IS 'Daily site reports — records weather, workforce, work completed, materials, equipment, safety observations, and delays per project per day.';

CREATE INDEX IF NOT EXISTS idx_daily_reports_project ON daily_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_status ON daily_reports(status);

-- =============================================================================
-- 9. INVOICES (with CIS + VAT support, line items stored as JSONB)
-- =============================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  invoice_number VARCHAR(50) NOT NULL,
  type VARCHAR(30) DEFAULT 'invoice' CHECK (type IN ('invoice', 'credit_note', 'proforma')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'paid', 'overdue', 'cancelled')),
  client_name VARCHAR(255),
  client_email VARCHAR(255),
  issue_date VARCHAR(20), -- YYYY-MM-DD
  due_date VARCHAR(20),   -- YYYY-MM-DD
  vat_rate VARCHAR(30) DEFAULT 'standard_20',
  is_cis_job BOOLEAN DEFAULT FALSE,
  cis_deduction_rate INTEGER DEFAULT 0,
  gross_labour_on_site DECIMAL(12,2) DEFAULT 0,
  gross_labour_off_site DECIMAL(12,2) DEFAULT 0,
  cis_deduction_amount DECIMAL(12,2) DEFAULT 0,
  subtotal DECIMAL(12,2) DEFAULT 0,
  vat_amount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  net_payable DECIMAL(12,2) DEFAULT 0,
  line_items JSONB, -- Array of InvoiceLineItem objects (see shared/cis.ts)
  notes TEXT,
  photo_url TEXT,
  ai_extracted BOOLEAN DEFAULT FALSE,
  approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE invoices IS 'Construction invoices with CIS (Construction Industry Scheme) and VAT support — line items stored as structured JSONB array.';
COMMENT ON COLUMN invoices.line_items IS 'JSONB array of InvoiceLineItem objects: { description, type, quantity, unit, rate, amount, cisLiable, category }';

CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_name);

-- =============================================================================
-- 10. UPDATED_AT TRIGGERS (auto-update updated_at on modification)
-- =============================================================================

-- Note: PostgreSQL doesn't support IF NOT EXISTS on CREATE TRIGGER
-- Use DO $$ BEGIN ... END $$; to make idempotent, or run these manually:

CREATE TRIGGER update_defects_updated_at
  BEFORE UPDATE ON defects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permits_updated_at
  BEFORE UPDATE ON permits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timesheets_updated_at
  BEFORE UPDATE ON timesheets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rfis_updated_at
  BEFORE UPDATE ON rfis
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drawings_updated_at
  BEFORE UPDATE ON drawings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_drawing_pins_updated_at
  BEFORE UPDATE ON drawing_pins
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_reports_updated_at
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 11. VERIFICATION QUERIES (commented out — run manually to verify)
-- =============================================================================

/*
-- List all new tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'defects', 'permits', 'timesheets', 'team_members',
  'rfis', 'drawings', 'drawing_pins', 'daily_reports', 'invoices'
)
ORDER BY table_name;

-- List indexes on new tables
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN (
  'defects', 'permits', 'timesheets', 'team_members',
  'rfis', 'drawings', 'drawing_pins', 'daily_reports', 'invoices'
)
ORDER BY tablename, indexname;

-- Check trigger creation
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname LIKE 'update_%_updated_at'
AND tgrelid::regclass::text IN (
  'defects', 'permits', 'timesheets', 'team_members',
  'rfis', 'drawings', 'drawing_pins', 'daily_reports', 'invoices'
);
*/
