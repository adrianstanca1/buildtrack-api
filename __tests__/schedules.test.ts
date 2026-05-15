import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Schedules Routes', () => {
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

  describe('GET /api/schedules', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/schedules');
      expect(res.status).toBe(401);
    });

    it('should list schedules', async () => {
      const res = await request(app)
        .get('/api/schedules')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/schedules', () => {
    it('should create a schedule entry', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          title: 'Week 1 - Foundation',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 7 * 86400000).toISOString(),
          progress: 0,
          status: 'not_started',
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
