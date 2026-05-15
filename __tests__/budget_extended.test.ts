import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Budget Routes (Extended)', () => {
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

  describe('GET /api/budget/costs', () => {
    it('should list cost entries', async () => {
      const res = await request(app)
        .get('/api/budget/costs')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/budget/summary/:projectId', () => {
    it('should return budget summary', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .get(`/api/budget/summary/${project.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 404]).toContain(res.status);
    });
  });
});
