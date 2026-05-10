-- BuildTrack API Security Migration — 2026-05-10
-- Changes refresh_tokens.token → refresh_tokens.token_hash (SHA-256)

BEGIN;

-- Step 1: Add token_hash column (nullable initially)
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);

-- Step 2: Populate token_hash from existing tokens using SHA-256
UPDATE refresh_tokens
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token_hash IS NULL;

-- Step 3: Verify no nulls remain
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM refresh_tokens WHERE token_hash IS NULL) THEN
    RAISE EXCEPTION 'Some refresh tokens could not be hashed';
  END IF;
END $$;

-- Step 4: Make token_hash NOT NULL
ALTER TABLE refresh_tokens ALTER COLUMN token_hash SET NOT NULL;

-- Step 5: Add unique index for lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Step 6: Drop old token column (safe now that all code uses token_hash)
ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS token;

COMMIT;

-- Step 7: Verify
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'refresh_tokens'
ORDER BY indexname;
