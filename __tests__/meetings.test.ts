import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Meetings Routes', () => {
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

  describe('GET /api/meetings', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/meetings');
      expect(res.status).toBe(401);
    });

    it('should list meetings', async () => {
      const res = await request(app)
        .get('/api/meetings')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/meetings', () => {
    it('should create a meeting', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          title: 'Weekly Site Review',
          date: new Date().toISOString(),
          location: 'Site Office',
          description: 'Review progress and issues',
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
