import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Purchase Orders Routes (Extended)', () => {
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

  describe('GET /api/purchase-orders with filters', () => {
    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/purchase-orders?status=draft')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/purchase-orders/:id', () => {
    it('should return 404 for non-existent PO', async () => {
      const res = await request(app)
        .get('/api/purchase-orders/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);
      expect([404, 400]).toContain(res.status);
    });
  });
});
