import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Safety Routes', () => {
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

  describe('GET /api/safety/incidents', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/safety/incidents');
      expect(res.status).toBe(401);
    });

    it('should list safety incidents', async () => {
      const res = await request(app)
        .get('/api/safety/incidents')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/safety/incidents', () => {
    it('should create a safety incident', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/safety/incidents')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          title: 'Near miss - falling object',
          description: 'A tool was dropped from scaffolding',
          severity: 'high',
          date: new Date().toISOString(),
          injuries: 0,
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
    });
  });
});
