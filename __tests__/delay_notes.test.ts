import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Delay Notes Routes', () => {
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

  describe('GET /api/delay-notes', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/delay-notes');
      expect(res.status).toBe(401);
    });

    it('should list delay notes', async () => {
      const res = await request(app)
        .get('/api/delay-notes')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/delay-notes', () => {
    it('should create a delay note', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/delay-notes')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          date: new Date().toISOString(),
          reason: 'Weather delay',
          description: 'Heavy rain stopped work',
          impactDays: 1,
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
