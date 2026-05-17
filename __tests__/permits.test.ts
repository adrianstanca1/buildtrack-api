import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Permits Routes', () => {
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

  describe('GET /api/permits', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/permits');
      expect(res.status).toBe(401);
    });

    it('should list permits', async () => {
      const res = await request(app)
        .get('/api/permits')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/permits', () => {
    it('should create a permit', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/permits')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          title: `Building Permit ${Date.now()}`,
          type: 'general',
          status: 'pending',
          issuedBy: 'City Council',
          validFrom: new Date().toISOString(),
          validTo: new Date(Date.now() + 365 * 86400000).toISOString(),
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
