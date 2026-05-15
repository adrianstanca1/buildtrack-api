import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Site Photos Routes', () => {
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

  describe('GET /api/site-photos', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/site-photos');
      expect(res.status).toBe(401);
    });

    it('should list site photos', async () => {
      const res = await request(app)
        .get('/api/site-photos')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/site-photos', () => {
    it('should create a site photo record', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/site-photos')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          title: 'Foundation pour complete',
          description: 'Concrete set and curing',
          url: 'https://example.com/photo.jpg',
          tags: ['foundation', 'concrete'],
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
