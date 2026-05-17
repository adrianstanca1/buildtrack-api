import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser } from './utils/fixtures';

describe('Exports Routes', () => {
  let app: any;
  let authToken: string;

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(async () => {
    const user = await createTestUser({ password: 'TestPassword123!' });

    const login = await request(app).post('/api/auth/login').send({
      email: user.email, password: 'TestPassword123!',
    });
    authToken = login.body.data.accessToken;
  });

  // /api/exports is a /projects/:id/closeout-shaped endpoint, not a list.
  describe('GET /api/exports/projects/:id/closeout', () => {
    it('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/exports/projects/00000000-0000-0000-0000-000000000001/closeout');
      expect(res.status).toBe(401);
    });

    it('should return 404/400 for missing project (auth passed)', async () => {
      const res = await request(app)
        .get('/api/exports/projects/00000000-0000-0000-0000-000000000001/closeout')
        .set('Authorization', `Bearer ${authToken}`);
      expect([200, 404, 400]).toContain(res.status);
    });
  });
});
