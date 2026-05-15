import dotenv from 'dotenv';
import { pool } from '../src/config/database';
import http from 'http';

dotenv.config();

const HEALTH_PORT = parseInt(process.env.PORT || '3001', 10);
const HEALTH_HOST = process.env.HEALTH_HOST || 'localhost';

interface HealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: { status: string; latencyMs: number; error?: string };
    api: { status: string; latencyMs: number; error?: string };
  };
}

async function checkDatabase(): Promise<HealthResult['checks']['database']> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err: any) {
    return { status: 'error', latencyMs: Date.now() - start, error: err.message };
  }
}

async function checkApi(): Promise<HealthResult['checks']['api']> {
  const start = Date.now();
  return new Promise((resolve) => {
    const req = http.get(`http://${HEALTH_HOST}:${HEALTH_PORT}/health`, (res) => {
      const ok = res.statusCode === 200;
      resolve({ status: ok ? 'ok' : 'error', latencyMs: Date.now() - start });
    });
    req.on('error', (err) => {
      resolve({ status: 'error', latencyMs: Date.now() - start, error: err.message });
    });
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ status: 'timeout', latencyMs: Date.now() - start, error: 'Request timed out' });
    });
  });
}

async function runHealthCheck() {
  const dbCheck = await checkDatabase();
  const apiCheck = await checkApi();

  const result: HealthResult = {
    status: dbCheck.status === 'ok' && apiCheck.status === 'ok' ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbCheck,
      api: apiCheck,
    },
  };

  console.log(JSON.stringify(result, null, 2));

  await pool.end();

  if (result.status !== 'healthy') {
    process.exit(1);
  }
}

runHealthCheck();
