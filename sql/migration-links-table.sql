-- Migration: Links table for connected records engine
-- Creates the generic links table + indexes

CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(30) NOT NULL,
  source_id UUID NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id UUID NOT NULL,
  relation VARCHAR(50) NOT NULL DEFAULT 'related',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  -- Prevent duplicate links in same direction
  CONSTRAINT unique_link UNIQUE (source_type, source_id, target_type, target_id, relation)
);

-- Index for fast lookup by source
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_type, source_id);
-- Index for fast lookup by target
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_type, target_id);
-- Index for activity graph traversal
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at DESC);

COMMENT ON TABLE links IS 'Generic many-to-many links between any two records (RFI, drawing, task, etc.)';
