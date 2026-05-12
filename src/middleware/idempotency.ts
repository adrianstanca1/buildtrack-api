/**
 * Idempotency middleware for safe offline-sync retries.
 * Clients set X-Idempotency-Key on mutation requests.
 * Within a 24-hour window, duplicate keys return the cached response.
 */

import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database.js';

// In-memory LRU for performance; falls back to DB on miss
const memoryCache = new Map<string, { status: number; body: any; expiresAt: number }>();
const MAX_MEMORY_KEYS = 5000;

async function pruneMemory(): Promise<void> {
  const now = Date.now();
  for (const [key, val] of memoryCache) {
    if (val.expiresAt < now) memoryCache.delete(key);
  }
  if (memoryCache.size > MAX_MEMORY_KEYS) {
    const toDelete = Array.from(memoryCache.keys()).slice(0, memoryCache.size - MAX_MEMORY_KEYS);
    toDelete.forEach((k) => memoryCache.delete(k));
  }
}

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const key = req.headers['x-idempotency-key'] as string | undefined;
  if (!key || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  await pruneMemory();

  // 1. Check in-memory
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    res.status(mem.status).json(mem.body);
    return;
  }

  // 2. Check DB
  try {
    const dbResult = await query(
      `SELECT status_code, response_body, expires_at
       FROM idempotency_keys
       WHERE key = $1 AND expires_at > NOW()`,
      [key]
    );
    if (dbResult.rows.length > 0) {
      const row = dbResult.rows[0];
      res.status(row.status_code).json(row.response_body);
      return;
    }
  } catch {
    // DB miss — continue
  }

  // 3. Intercept response to cache it
  const originalJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);
  let capturedStatus = 200;

  res.status = (code: number) => {
    capturedStatus = code;
    return originalStatus(code);
  };

  res.json = (body: any) => {
    const expiresAt = Date.now() + 24 * 3600_000; // 24h
    memoryCache.set(key, { status: capturedStatus, body, expiresAt });

    // Async DB write (fire-and-forget; non-blocking)
    query(
      `INSERT INTO idempotency_keys (key, status_code, response_body, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '24 hours')
       ON CONFLICT (key) DO NOTHING`,
      [key, capturedStatus, JSON.stringify(body)]
    ).catch(() => {
      // Swallow — best-effort persistence
    });

    return originalJson(body);
  };

  next();
}

// DB table init
export async function initIdempotencyTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key VARCHAR(255) PRIMARY KEY,
      status_code INTEGER NOT NULL,
      response_body JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_idempotency_expires
    ON idempotency_keys(expires_at)
  `);
}
