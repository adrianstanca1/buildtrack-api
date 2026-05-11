import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser } from './utils/fixtures';
import jwt from 'jsonwebtoken';

describe('Middleware', () => {
  let app: any;

  beforeAll(async () => {
    app = await createApp();
  });

  describe('Auth Middleware', () => {
    it('should allow access with valid Bearer token', async () => {
      const user = await createTestUser();
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'buildtrack-test-secret-key-for-jwt-signing-only',
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject request without Authorization header', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject malformed Authorization header', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', 'invalid');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject expired token', async () => {
      const user = await createTestUser();
      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET || 'buildtrack-test-secret-key-for-jwt-signing-only',
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('should reject token for non-existent user', async () => {
      const token = jwt.sign(
        { userId: '00000000-0000-0000-0000-000000000000', email: 'ghost@example.com', role: 'user' },
        process.env.JWT_SECRET || 'buildtrack-test-secret-key-for-jwt-signing-only',
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Validation Middleware', () => {
    it('should reject invalid body fields with 400', async () => {
      const user = await createTestUser({ password: 'TestPassword123!' });
      const login = await request(app).post('/api/auth/login').send({
        email: user.email, password: 'TestPassword123!',
      });
      const token = login.body.data.accessToken;

      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 123 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid UUID in URL params', async () => {
      const user = await createTestUser({ password: 'TestPassword123!' });
      const login = await request(app).post('/api/auth/login').send({
        email: user.email, password: 'TestPassword123!',
      });
      const token = login.body.data.accessToken;

      const res = await request(app)
        .get('/api/projects/not-a-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Error Handler', () => {
    it('should return structured error for 404 endpoints', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toHaveProperty('message');
      expect(res.body.error).toHaveProperty('code');
    });

    it('should handle server errors gracefully', async () => {
      // Trigger a route that causes an error — we'll test a malformed request
      const user = await createTestUser({ password: 'TestPassword123!' });
      const login = await request(app).post('/api/auth/login').send({
        email: user.email, password: 'TestPassword123!',
      });
      const token = login.body.data.accessToken;

      // Send extremely large progress value to trigger DB check
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test', progress: 999 });

      expect([400, 500]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toHaveProperty('code');
    });
  });
});
