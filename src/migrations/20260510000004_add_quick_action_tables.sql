-- Migration: Add punch_items, site_photos, delay_notes tables
-- Created: 2026-05-10

-- ─── Punch Items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS punch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  severity VARCHAR(20) NOT NULL DEFAULT 'minor' CHECK (severity IN ('cosmetic', 'minor', 'major', 'critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assignee VARCHAR(255),
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_punch_items_project ON punch_items(project_id);
CREATE INDEX IF NOT EXISTS idx_punch_items_status ON punch_items(status);
CREATE INDEX IF NOT EXISTS idx_punch_items_created_by ON punch_items(created_by);

-- Trigger for updated_at
CREATE TRIGGER update_punch_items_updated_at
  BEFORE UPDATE ON punch_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── Site Photos ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  location VARCHAR(255),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  caption TEXT,
  photo_url TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_photos_project ON site_photos(project_id);
CREATE INDEX IF NOT EXISTS idx_site_photos_uploaded_by ON site_photos(uploaded_by);

-- ─── Delay Notes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delay_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(255) NOT NULL,
  description TEXT,
  linked_rfi_id UUID REFERENCES rfis(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'closed')),
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delay_notes_project ON delay_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_delay_notes_created_by ON delay_notes(created_by);
CREATE INDEX IF NOT EXISTS idx_delay_notes_linked_rfi ON delay_notes(linked_rfi_id);

-- Trigger for updated_at
CREATE TRIGGER update_delay_notes_updated_at
  BEFORE UPDATE ON delay_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
