import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { pool, initDatabase } from '../src/config/database';
import bcrypt from 'bcryptjs';

dotenv.config();

const DEFAULT_PASSWORD = 'TestPassword123!';

async function seedDatabase() {
  try {
    await initDatabase();
    console.log('[Seed] Database initialised');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Seed users
      const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
      const adminId = uuidv4();
      const userId = uuidv4();

      await client.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, company_name, subscription_tier, subscription_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (email) DO NOTHING`,
        [adminId, 'admin@buildtrack.local', passwordHash, 'Admin', 'User', 'admin', 'BuildTrack Inc', 'enterprise', 'active']
      );

      await client.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role, company_name, subscription_tier, subscription_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (email) DO NOTHING`,
        [userId, 'user@buildtrack.local', passwordHash, 'Regular', 'User', 'user', 'TestCo', 'pro', 'active']
      );

      // Seed a project
      const projectId = uuidv4();
      await client.query(
        `INSERT INTO projects (id, user_id, name, description, location, budget, status, start_date, end_date, color)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT DO NOTHING`,
        [projectId, userId, 'Demo Construction Project', 'A sample project for testing', '123 Builder Lane', 500000, 'active', new Date(), new Date(Date.now() + 180 * 86400000), '#2563eb']
      );

      // Seed workers
      for (let i = 0; i < 5; i++) {
        await client.query(
          `INSERT INTO workers (id, user_id, name, role, status, phone, email, hourly_rate, weekly_hours, certifications)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT DO NOTHING`,
          [uuidv4(), userId, `Worker ${i + 1}`, ['carpenter', 'electrician', 'plumber', 'mason', 'laborer'][i], 'active', `555-010${i}`, `worker${i}@local`, 25 + i * 5, 40, JSON.stringify(['OSHA 10'])]
        );
      }

      // Seed tasks
      for (let i = 0; i < 10; i++) {
        await client.query(
          `INSERT INTO tasks (id, project_id, title, description, priority, status, due_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [uuidv4(), projectId, `Task ${i + 1}`, `Description for task ${i + 1}`, ['low', 'medium', 'high'][i % 3], ['pending', 'in_progress', 'completed'][i % 3], new Date(Date.now() + (i + 1) * 86400000)]
        );
      }

      // Seed safety incidents
      for (let i = 0; i < 3; i++) {
        await client.query(
          `INSERT INTO safety_incidents (id, project_id, reported_by, title, description, severity, date, injuries, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT DO NOTHING`,
          [uuidv4(), projectId, userId, `Incident ${i + 1}`, 'Test incident description', ['low', 'medium', 'high'][i], new Date(), i, 'open']
        );
      }

      // Seed inspections
      for (let i = 0; i < 3; i++) {
        await client.query(
          `INSERT INTO inspections (id, project_id, title, inspector_name, description, status, date)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [uuidv4(), projectId, `Inspection ${i + 1}`, 'Inspector Jones', 'Routine check', ['pending', 'passed', 'failed'][i], new Date()]
        );
      }

      // Seed notifications
      for (let i = 0; i < 5; i++) {
        await client.query(
          `INSERT INTO notifications (id, user_id, title, body, type, read)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [uuidv4(), userId, `Notification ${i + 1}`, 'This is a test notification', 'general', i % 2 === 0]
        );
      }

      await client.query('COMMIT');
      console.log('[Seed] Database seeded successfully');
      console.log('[Seed] Users: admin@buildtrack.local / user@buildtrack.local');
      console.log(`[Seed] Password: ${DEFAULT_PASSWORD}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[Seed] Failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seedDatabase();
}

export { seedDatabase };
