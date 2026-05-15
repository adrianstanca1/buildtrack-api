import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Budget Routes', () => {
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

  describe('GET /api/budget/categories', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/budget/categories');
      expect(res.status).toBe(401);
    });

    it('should list budget categories', async () => {
      const res = await request(app)
        .get('/api/budget/categories')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/budget/categories', () => {
    it('should create a budget category', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/budget/categories')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          name: 'Materials',
          budgetAmount: 50000,
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });
  });
});
