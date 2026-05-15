import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser } from './utils/fixtures';

describe('Dashboard Routes', () => {
  let app: any;
  let authToken: string;

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(async () => {
    const user = await createTestUser({ password: 'TestPassword123!' });

    const login = await request(app).post('/api/auth/login').send({
      email: user.email, password: 'TestPassword123!',
    });
    authToken = login.body.data.accessToken;
  });

  describe('GET /api/dashboard/stats', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/dashboard/stats');
      expect(res.status).toBe(401);
    });

    it('should return dashboard stats', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total_projects');
    });
  });

  describe('GET /api/dashboard/activity', () => {
    it('should return activity feed', async () => {
      const res = await request(app)
        .get('/api/dashboard/activity')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
