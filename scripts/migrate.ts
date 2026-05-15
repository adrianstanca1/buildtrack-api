import dotenv from 'dotenv';
import { pool } from '../src/config/database';
import fs from 'fs';
import path from 'path';

dotenv.config();

const MIGRATIONS_DIR = path.join(process.cwd(), 'sql');

async function getAppliedMigrations(): Promise<Set<string>> {
  try {
    const result = await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);
    const { rows } = await pool.query('SELECT filename FROM schema_migrations');
    return new Set(rows.map((r: any) => r.filename));
  } catch (err) {
    console.warn('[Migrate] Could not query schema_migrations, assuming fresh database');
    return new Set();
  }
}

async function applyMigration(filename: string, sql: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [filename]
    );
    await client.query('COMMIT');
    console.log(`[Migrate] Applied: ${filename}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[Migrate] Failed: ${filename}`, err);
    throw err;
  } finally {
    client.release();
  }
}

async function runMigrations() {
  try {
    const applied = await getAppliedMigrations();
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((f: string) => f.endsWith('.sql') && f.startsWith('migration-'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[Migrate] Skipped (already applied): ${file}`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      await applyMigration(file, sql);
      count++;
    }

    console.log(`[Migrate] ${count} migration(s) applied. Total applied: ${applied.size + count}`);
  } catch (err) {
    console.error('[Migrate] Failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function rollbackMigration(count: number = 1) {
  console.warn('[Migrate] Rollback not yet implemented. Manual rollback required.');
  await pool.end();
}

const command = process.argv[2] || 'up';
if (command === 'up') {
  runMigrations();
} else if (command === 'down') {
  const count = parseInt(process.argv[3] || '1', 10);
  rollbackMigration(count);
} else {
  console.error('[Migrate] Unknown command. Use: up | down [count]');
  process.exit(1);
}
