-- =========================================================================
-- Migration: Guest collaborator model + magic links
-- Date: 2026-05-10
-- =========================================================================

-- --------------------------------------------------------------------------
-- Guest collaborators (external users without full accounts)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  company VARCHAR(255),
  phone VARCHAR(50),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(email, company)
);

CREATE INDEX IF NOT EXISTS idx_guests_email ON guests(email);
CREATE INDEX IF NOT EXISTS idx_guests_company ON guests(company);

-- --------------------------------------------------------------------------
-- Project guest access (which guests can see which projects)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES guests(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'viewer' CHECK (role IN ('viewer', 'responder', 'uploader')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_at TIMESTAMP DEFAULT NOW(),
  last_accessed_at TIMESTAMP,
  access_count INTEGER DEFAULT 0,
  UNIQUE(project_id, guest_id)
);

CREATE INDEX IF NOT EXISTS idx_project_guests_project ON project_guests(project_id);
CREATE INDEX IF NOT EXISTS idx_project_guests_guest ON project_guests(guest_id);

-- --------------------------------------------------------------------------
-- Magic links for guest access (time-limited, single-use)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) UNIQUE NOT NULL,
  guest_id UUID REFERENCES guests(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  target_type VARCHAR(50) DEFAULT 'project', -- project, rfi, submittal, drawing, etc.
  target_id UUID, -- specific record if applicable
  action VARCHAR(50) DEFAULT 'view', -- view, respond, upload, approve
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  used_ip INET,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token);
CREATE INDEX IF NOT EXISTS idx_magic_links_guest ON magic_links(guest_id);
CREATE INDEX IF NOT EXISTS idx_magic_links_expires ON magic_links(expires_at);

-- Triggers
CREATE TRIGGER trg_guests_updated
  BEFORE UPDATE ON guests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
