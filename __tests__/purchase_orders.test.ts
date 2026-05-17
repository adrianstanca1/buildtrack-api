import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Purchase Orders Routes', () => {
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

  describe('GET /api/purchase-orders', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/purchase-orders');
      expect(res.status).toBe(401);
    });

    it('should list purchase orders', async () => {
      const res = await request(app)
        .get('/api/purchase-orders')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/purchase-orders', () => {
    it('should create a purchase order', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/purchase-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          poNumber: `PO-${Date.now()}`,
          title: 'Rebar supply',
          vendorName: 'SteelCorp',
          description: 'Steel reinforcement bars for foundation pour',
          total: 12000,
          status: 'draft',
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
