import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Workers Routes', () => {
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

  describe('GET /api/workers', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/workers');
      expect(res.status).toBe(401);
    });

    it('should list workers', async () => {
      const res = await request(app)
        .get('/api/workers')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/workers', () => {
    it('should create a worker', async () => {
      const res = await request(app)
        .post('/api/workers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'John Builder',
          role: 'carpenter',
          status: 'active',
          phone: '555-0199',
          email: `worker-${Date.now()}@example.com`,
          hourlyRate: 30,
          weeklyHours: 40,
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });
  });
});
