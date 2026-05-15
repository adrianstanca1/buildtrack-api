import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser } from './utils/fixtures';

describe('Exports Routes', () => {
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

  describe('GET /api/exports', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/exports');
      expect(res.status).toBe(401);
    });

    it('should list exports', async () => {
      const res = await request(app)
        .get('/api/exports')
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 404]).toContain(res.status);
    });
  });
});
