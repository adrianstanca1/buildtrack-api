import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Links Routes', () => {
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

  // SKIP: src/routes/links.ts exposes no GET /api/links list endpoint —
  // only POST / (create entity link) and GET /:type/:id/related (list links
  // for a specific record). These tests assume a generic list endpoint that
  // doesn't exist. Unskip once a list endpoint is added or rewrite tests
  // to use GET /:type/:id/related.
  describe.skip('GET /api/links', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/links');
      expect(res.status).toBe(401);
    });

    it('should list links', async () => {
      const res = await request(app)
        .get('/api/links')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/links', () => {
    it('should create a link between two entities', async () => {
      // /api/links creates entity-to-entity relations, NOT project URLs.
      // Use two project rows as both endpoints — link table doesn't restrict
      // sourceType/targetType to a fixed set, just requires UUIDs.
      const source = await createTestProject(userId);
      const target = await createTestProject(userId, { name: 'Linked Project' });
      const res = await request(app)
        .post('/api/links')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sourceType: 'project',
          sourceId: source.id,
          targetType: 'project',
          targetId: target.id,
          relation: 'related',
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
