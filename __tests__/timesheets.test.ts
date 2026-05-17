import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';
import { query } from '../src/config/database';

describe('Timesheets Routes', () => {
  let app: any;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(async () => {
    const user = await createTestUser({ password: 'TestPassword123!' });
    userId = user.id;

    const login = await request(app).post('/api/auth/login').send({
      email: user.email, password: 'TestPassword123!',
    });
    authToken = login.body.data.accessToken;
  });

  describe('GET /api/timesheets', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/timesheets');
      expect(res.status).toBe(401);
    });

    it('should list timesheets', async () => {
      const res = await request(app)
        .get('/api/timesheets')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/timesheets', () => {
    it('should create a timesheet entry', async () => {
      const project = await createTestProject(userId);
      // Timesheets reference workers via worker_id FK — create one inline.
      const worker = await query(
        `INSERT INTO workers (user_id, name, role, status, hourly_rate)
         VALUES ($1, 'Test Carpenter', 'carpenter', 'active', 25)
         RETURNING id`,
        [userId]
      );
      const res = await request(app)
        .post('/api/timesheets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          workerId: worker.rows[0].id,
          entryDate: new Date().toISOString().slice(0, 10),
          hoursWorked: 8,
          workDescription: 'Framing work',
          category: 'regular',
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
