import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Punch Items Routes', () => {
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

  describe('GET /api/punch-items', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/punch-items');
      expect(res.status).toBe(401);
    });

    it('should list punch items', async () => {
      const res = await request(app)
        .get('/api/punch-items')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/punch-items', () => {
    it('should create a punch item', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/punch-items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          title: 'Paint touch-up needed',
          description: 'Wall near window',
          location: 'Room 101',
          priority: 'low',
          status: 'open',
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
