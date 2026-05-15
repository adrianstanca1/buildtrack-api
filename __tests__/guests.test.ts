import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Guests Routes', () => {
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

  describe('GET /api/guests', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/guests');
      expect(res.status).toBe(401);
    });

    it('should list guests', async () => {
      const res = await request(app)
        .get('/api/guests')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/guests', () => {
    it('should create a guest', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/guests')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          name: 'Inspector Johnson',
          email: `guest-${Date.now()}@example.com`,
          role: 'inspector',
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
