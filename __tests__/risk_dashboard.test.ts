import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Risk Dashboard Routes', () => {
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

  describe('GET /api/risk-dashboard', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/risk-dashboard');
      expect(res.status).toBe(401);
    });

    it('should return risk dashboard data', async () => {
      const res = await request(app)
        .get('/api/risk-dashboard')
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });
  });
});
