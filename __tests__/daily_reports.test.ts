import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Daily Reports Routes', () => {
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

  describe('GET /api/daily-reports', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/daily-reports');
      expect(res.status).toBe(401);
    });

    it('should list daily reports', async () => {
      const res = await request(app)
        .get('/api/daily-reports')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/daily-reports', () => {
    it('should create a daily report', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/daily-reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          date: new Date().toISOString(),
          weather: 'Sunny, 22C',
          workCompleted: 'Framing first floor',
          notes: 'On schedule',
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
