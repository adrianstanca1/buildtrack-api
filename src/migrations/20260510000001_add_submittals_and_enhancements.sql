-- =========================================================================
-- Migration: Add submittals table + enhance RFIs and drawings
-- Date: 2026-05-10
-- =========================================================================

-- --------------------------------------------------------------------------
-- Submittals (new table)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submittals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  submittal_number VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  spec_section VARCHAR(50),
  type VARCHAR(50) DEFAULT 'shop_drawing' CHECK (type IN ('shop_drawing', 'product_data', 'sample', 'mockup', 'closeout', 'other')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'approved_as_noted', 'rejected', 'resubmit', 'closed')),
  ball_in_court UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  responsible_company VARCHAR(255),
  due_date DATE,
  submitted_at TIMESTAMP,
  reviewed_at TIMESTAMP,
  response TEXT,
  attachment_urls JSONB DEFAULT '[]',
  linked_drawing_id UUID REFERENCES drawings(id) ON DELETE SET NULL,
  linked_spec_doc TEXT,
  distribution_list JSONB DEFAULT '[]',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submittals_project ON submittals(project_id);
CREATE INDEX IF NOT EXISTS idx_submittals_status ON submittals(status);
CREATE INDEX IF NOT EXISTS idx_submittals_ball_in_court ON submittals(ball_in_court);
CREATE INDEX IF NOT EXISTS idx_submittals_due_date ON submittals(due_date);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_submittals_updated
  BEFORE UPDATE ON submittals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- --------------------------------------------------------------------------
-- Enhance RFIs: add ball_in_court column
-- --------------------------------------------------------------------------
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS ball_in_court UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS responsible_company VARCHAR(255);
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS distribution_list JSONB DEFAULT '[]';
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS official_response TEXT;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS official_responded_at TIMESTAMP;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS revision_number VARCHAR(20);
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS linked_spec_doc TEXT;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_rfis_ball_in_court ON rfis(ball_in_court);
CREATE INDEX IF NOT EXISTS idx_rfis_due_date ON rfis(due_date);

-- --------------------------------------------------------------------------
-- Enhance drawings: add revision tracking
-- --------------------------------------------------------------------------
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS revision_date DATE;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS superseded BOOLEAN DEFAULT FALSE;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS current BOOLEAN DEFAULT TRUE;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES drawings(id) ON DELETE SET NULL;
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS sheet_number VARCHAR(50);
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS sheet_title VARCHAR(255);
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS distribution_history JSONB DEFAULT '[]';
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS linked_rfis JSONB DEFAULT '[]';
ALTER TABLE drawings ADD COLUMN IF NOT EXISTS linked_submittals JSONB DEFAULT '[]';

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_drawings_current ON drawings(current);
CREATE INDEX IF NOT EXISTS idx_drawings_superseded ON drawings(superseded);

-- --------------------------------------------------------------------------
-- Audit log: enhance with structured fields
-- --------------------------------------------------------------------------
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS role VARCHAR(50);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS before_state JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS after_state JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS distribution_list JSONB DEFAULT '[]';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS export_record BOOLEAN DEFAULT FALSE;
