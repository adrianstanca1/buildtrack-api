// Runs before jest imports test files (configured in jest.config.js
// `setupFiles`). Must execute BEFORE src/config/database.ts is
// imported so the pg pool uses TEST_DATABASE_URL.
import dotenv from 'dotenv';
import path from 'path';

// Load .env.test first (test-specific overrides), then .env as a
// fallback for any var .env.test doesn't set. dotenv won't overwrite
// already-set values, so the first config() call wins on conflicts.
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Force NODE_ENV=test even if .env.test is missing. errorHandler etc
// branch on this.
process.env.NODE_ENV = 'test';
