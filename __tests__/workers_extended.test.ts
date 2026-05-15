import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject, createTestWorker } from './utils/fixtures';

describe('Workers Routes (Extended)', () => {
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

  describe('GET /api/workers with filters', () => {
    it('should filter by role', async () => {
      await createTestWorker(userId, { role: 'carpenter' });
      const res = await request(app)
        .get('/api/workers?role=carpenter')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/workers?status=active')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/workers/:id', () => {
    it('should get worker by id', async () => {
      const worker = await createTestWorker(userId);
      const res = await request(app)
        .get(`/api/workers/${worker.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(worker.id);
    });

    it('should return 404 for non-existent worker', async () => {
      const res = await request(app)
        .get('/api/workers/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);
      expect([404, 400]).toContain(res.status);
    });
  });
});
