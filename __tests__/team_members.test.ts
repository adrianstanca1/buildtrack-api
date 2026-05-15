import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Team Members Routes', () => {
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

  describe('GET /api/team-members', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/team-members');
      expect(res.status).toBe(401);
    });

    it('should list team members', async () => {
      const res = await request(app)
        .get('/api/team-members')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/team-members', () => {
    it('should create a team member', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/team-members')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          name: 'Jane Engineer',
          email: `member-${Date.now()}@example.com`,
          role: 'engineer',
          permissions: ['view', 'edit'],
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
