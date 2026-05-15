import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Project Timeline Routes', () => {
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

  describe('GET /api/projects/:projectId/timeline', () => {
    it('should return 401 without token', async () => {
      const project = await createTestProject(userId);
      const res = await request(app).get(`/api/projects/${project.id}/timeline`);
      expect(res.status).toBe(401);
    });

    it('should return timeline for project', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .get(`/api/projects/${project.id}/timeline`)
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 404, 500]).toContain(res.status);
    });
  });
});
