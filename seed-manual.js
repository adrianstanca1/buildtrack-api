require('dotenv').config();
const { pool } = require('./dist/config/database.js');
const bcrypt = require('bcryptjs');

async function seed() {
  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash('demo1234', 12);
    await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, company_name, subscription_tier, subscription_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT DO NOTHING`,
      ['demo@buildtrack.com', hash, 'Demo', 'User', 'admin', 'BuildTrack Demo', 'pro', 'active']
    );
    console.log('[Seed] User created');

    const userRes = await client.query('SELECT id FROM users WHERE email = $1', ['demo@buildtrack.com']);
    if (userRes.rows.length === 0) { console.log('[Seed] No user'); return; }
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO projects (user_id, name, description, location, budget, progress, status, start_date, end_date, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '#2563eb')
       ON CONFLICT DO NOTHING`,
      [userId, 'Downtown Office Complex', '12-story office building', '123 Main St', 2500000, 45, 'active', '2024-01-15', '2025-06-30']
    );
    console.log('[Seed] Project created');

    const projRes = await client.query('SELECT id FROM projects WHERE name = $1', ['Downtown Office Complex']);
    if (projRes.rows.length === 0) { console.log('[Seed] No project'); return; }
    const projectId = projRes.rows[0].id;

    const tasks = [
      ['Foundation excavation', 'Excavate site', 'high', 'pending'],
      ['Pour concrete', 'Reinforced concrete foundation', 'high', 'pending'],
      ['Steel frame', 'Erect structural steel', 'medium', 'pending'],
      ['Electrical rough-in', 'Install conduits', 'medium', 'pending'],
      ['Plumbing', 'Main lines', 'low', 'pending'],
    ];
    for (const [title, desc, priority, status] of tasks) {
      await client.query(
        `INSERT INTO tasks (project_id, title, description, priority, status, due_date)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '30 days')`,
        [projectId, title, desc, priority, status]
      );
    }
    console.log('[Seed] Tasks created');

    const workers = [
      ['John Smith', 'foreman', '555-0101', 'john@example.com'],
      ['Mike Johnson', 'electrician', '555-0102', 'mike@example.com'],
      ['Sarah Williams', 'plumber', '555-0103', 'sarah@example.com'],
      ['David Brown', 'carpenter', '555-0104', 'david@example.com'],
    ];
    for (const [name, role, phone, email] of workers) {
      await client.query(
        `INSERT INTO workers (user_id, name, role, phone, email, hourly_rate, weekly_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, name, role, phone, email, 25 + Math.floor(Math.random() * 30), 40]
      );
    }
    console.log('[Seed] Workers created');

    console.log('[Seed] Complete!');
  } catch (e) {
    console.error('[Seed] Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
