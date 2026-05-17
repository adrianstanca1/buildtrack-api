import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Drawings Routes', () => {
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

  describe('GET /api/drawings', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/drawings');
      expect(res.status).toBe(401);
    });

    it('should list drawings', async () => {
      const res = await request(app)
        .get('/api/drawings')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/drawings', () => {
    it('should create a drawing record', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/drawings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          title: 'Foundation Plan Rev A',
          version: 'A',
          status: 'current',
          fileUrl: 'https://example.com/drawing.pdf',
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
