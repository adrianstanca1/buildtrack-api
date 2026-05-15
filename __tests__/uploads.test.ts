import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser } from './utils/fixtures';

describe('Uploads Routes', () => {
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

  describe('POST /api/uploads', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).post('/api/uploads');
      expect(res.status).toBe(401);
    });

    it('should reject upload without file', async () => {
      const res = await request(app)
        .post('/api/uploads')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
