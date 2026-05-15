import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser } from './utils/fixtures';

describe('Admin Routes', () => {
  let app: any;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(async () => {
    const admin = await createTestUser({ role: 'admin', password: 'TestPassword123!' });
    const user = await createTestUser({ role: 'user', password: 'TestPassword123!' });

    const adminLogin = await request(app).post('/api/auth/login').send({
      email: admin.email, password: 'TestPassword123!',
    });
    adminToken = adminLogin.body.data.accessToken;

    const userLogin = await request(app).post('/api/auth/login').send({
      email: user.email, password: 'TestPassword123!',
    });
    userToken = userLogin.body.data.accessToken;
  });

  describe('GET /api/admin/users', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/admin/users');
      expect(res.status).toBe(401);
    });

    it('should list users for admin', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should deny access for non-admin user', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });
});
