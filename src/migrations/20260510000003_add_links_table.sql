-- =========================================================================
-- Migration: Links table for cross-referencing records
-- Date: 2026-05-10
-- =========================================================================

-- --------------------------------------------------------------------------
-- Links table — generic many-to-many linking between any records
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL,
  source_id UUID NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id UUID NOT NULL,
  relation VARCHAR(50) DEFAULT 'related',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Composite unique to prevent duplicate links (undirected)
CREATE UNIQUE INDEX IF NOT EXISTS idx_links_unique_pair
  ON links (LEAST(source_type, target_type), LEAST(source_id::text, target_id::text), GREATEST(source_type, target_type), GREATEST(source_id::text, target_id::text));

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_links_created_by ON links(created_by);
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at DESC);
