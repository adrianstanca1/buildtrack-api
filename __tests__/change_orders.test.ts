import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Change Orders Routes', () => {
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

  describe('GET /api/change-orders', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/change-orders');
      expect(res.status).toBe(401);
    });

    it('should list change orders', async () => {
      const res = await request(app)
        .get('/api/change-orders')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/change-orders', () => {
    it('should create a change order', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/change-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          title: 'Foundation Adjustment',
          description: 'Increase depth by 0.5m',
          costImpact: 5000,
          status: 'pending',
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });
  });
});
