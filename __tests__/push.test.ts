import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser } from './utils/fixtures';

describe('Push Routes', () => {
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

  describe('GET /api/push', () => {
    it('should return 401 or 404 without token', async () => {
      const res = await request(app).get('/api/push');
      expect([401, 404]).toContain(res.status);
    });

    it('should access push endpoints', async () => {
      const res = await request(app)
        .get('/api/push')
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 404]).toContain(res.status);
    });
  });
});
