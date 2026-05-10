-- =========================================================================
-- Migration: Align team_members schema with integration spec + API code
-- Date: 2026-05-10
-- =========================================================================

-- Add user_id column (required for auth isolation)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Rename cscs_card_type → cscs_card to match API code
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_members' AND column_name='cscs_card_type') THEN
    ALTER TABLE team_members RENAME COLUMN cscs_card_type TO cscs_card;
  END IF;
END $$;

-- Drop cscs_expiry if exists (not used in integration schema)
ALTER TABLE team_members DROP COLUMN IF EXISTS cscs_expiry;

-- Drop role if exists (not used in integration schema — trade is the equivalent)
ALTER TABLE team_members DROP COLUMN IF EXISTS role;

-- Drop avatar_url if exists (not used in integration schema)
ALTER TABLE team_members DROP COLUMN IF EXISTS avatar_url;

-- Ensure status check constraint matches integration spec
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_status_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_status_check
  CHECK (status IN ('active', 'inactive', 'on-leave'));

-- Update any existing rows to have a valid user_id (set to first admin user)
UPDATE team_members
SET user_id = (SELECT id FROM users WHERE role = 'admin' LIMIT 1)
WHERE user_id IS NULL;

-- Add index on user_id
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
