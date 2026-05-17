import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Equipment Routes', () => {
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

  describe('GET /api/equipment', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/equipment');
      expect(res.status).toBe(401);
    });

    it('should list equipment', async () => {
      const res = await request(app)
        .get('/api/equipment')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/equipment', () => {
    it('should create equipment', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/equipment')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          name: 'Excavator 320D',
          type: 'excavator',
          status: 'available',
          dailyRate: 960,
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
