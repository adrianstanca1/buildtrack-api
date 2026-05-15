import { pool } from '../src/config/database';
import crypto from 'crypto';

const SEED_DATA = {
  projects: [
    { name: 'Riverside Apartments', budget: 2500000, status: 'active' },
    { name: 'Metro Office Tower', budget: 4500000, status: 'active' },
    { name: 'Parkside Villas', budget: 1200000, status: 'planning' },
  ],
  workers: [
    { name: 'John Smith', trade: 'Electrician', hourly_rate: 35, status: 'active' },
    { name: 'Sarah Jones', trade: 'Plumber', hourly_rate: 40, status: 'active' },
    { name: 'Mike Chen', trade: 'Carpenter', hourly_rate: 32, status: 'active' },
  ],
};

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Seed projects
    for (const p of SEED_DATA.projects) {
      await client.query(
        `INSERT INTO projects (id, name, budget, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), p.name, p.budget, p.status]
      );
    }
    console.log(`✅ Seeded ${SEED_DATA.projects.length} projects`);
    
    // Seed workers
    for (const w of SEED_DATA.workers) {
      await client.query(
        `INSERT INTO workers (id, name, trade, hourly_rate, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT DO NOTHING`,
        [crypto.randomUUID(), w.name, w.trade, w.hourly_rate, w.status]
      );
    }
    console.log(`✅ Seeded ${SEED_DATA.workers.length} workers`);
    
    await client.query('COMMIT');
    console.log('🌱 Database seeded successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
