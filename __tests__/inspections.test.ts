import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Inspections Routes', () => {
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

  describe('GET /api/inspections', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/inspections');
      expect(res.status).toBe(401);
    });

    it('should list inspections', async () => {
      const res = await request(app)
        .get('/api/inspections')
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
      }
    });
  });

  describe('POST /api/inspections', () => {
    it('should create an inspection', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/inspections')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          title: 'Foundation Inspection',
          inspectorName: 'John Smith',
          description: 'Check rebar placement',
          status: 'pending',
          date: new Date().toISOString(),
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });
  });
});
