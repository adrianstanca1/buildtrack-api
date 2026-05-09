import { pool, initDatabase, seedDatabase } from './dist/config/database.js';

async function main() {
  await initDatabase();
  await seedDatabase();
  await pool.end();
  console.log('[Seed] Database seeded successfully');
}

main().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
