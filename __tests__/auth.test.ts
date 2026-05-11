import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from './utils/testApp';
import { createTestUser } from './utils/fixtures';

const JWT_SECRET = process.env.JWT_SECRET || 'buildtrack-test-secret-key-for-jwt-signing-only';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'buildtrack-test-refresh-secret-key-only';

describe('Auth Routes', () => {
  let app: any;

  beforeAll(async () => {
    app = await createApp();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user and return 201 with user + accessToken', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: `test_${Date.now()}@example.com`,
          password: 'TestPassword123!',
          firstName: 'Test',
          lastName: 'User',
          companyName: 'TestCo',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: `weak_${Date.now()}@example.com`,
          password: '123',
          firstName: 'Test',
          lastName: 'User',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'not-an-email',
          password: 'TestPassword123!',
          firstName: 'Test',
          lastName: 'User',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject duplicate email with 409', async () => {
      const email = `dup_${Date.now()}@example.com`;
      await request(app).post('/api/auth/register').send({
        email, password: 'TestPassword123!', firstName: 'Test', lastName: 'User',
      });

      const res = await request(app).post('/api/auth/register').send({
        email, password: 'TestPassword123!', firstName: 'Test', lastName: 'User',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('CONFLICT');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const email = `login_${Date.now()}@example.com`;
      const password = 'TestPassword123!';

      await request(app).post('/api/auth/register').send({
        email, password, firstName: 'Test', lastName: 'User',
      });

      const res = await request(app).post('/api/auth/login').send({ email, password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data.user.email).toBe(email.toLowerCase());
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject invalid password with 401', async () => {
      const email = `bad_${Date.now()}@example.com`;
      await request(app).post('/api/auth/register').send({
        email, password: 'TestPassword123!', firstName: 'Test', lastName: 'User',
      });

      const res = await request(app).post('/api/auth/login').send({
        email, password: 'wrongpassword',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject non-existent user with 401', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nope@example.com', password: 'TestPassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing password', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com' });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens when valid refresh token provided via cookie', async () => {
      const email = `refresh_${Date.now()}@example.com`;
      const password = 'TestPassword123!';

      const reg = await request(app).post('/api/auth/register').send({
        email, password, firstName: 'Test', lastName: 'User',
      });

      const agent = request.agent(app);
      // Simulate cookie from registration
      const cookies = reg.headers['set-cookie'];
      const res = await agent
        .post('/api/auth/refresh')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject request without refresh token', async () => {
      const res = await request(app).post('/api/auth/refresh');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['refreshToken=invalid.token.here']);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout and clear cookies', async () => {
      const email = `logout_${Date.now()}@example.com`;
      const password = 'TestPassword123!';

      const reg = await request(app).post('/api/auth/register').send({
        email, password, firstName: 'Test', lastName: 'User',
      });

      const cookies = reg.headers['set-cookie'];
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookies);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toMatch(/logged out/i);
    });

    it('should allow logout even without token (idempotent)', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user when authenticated', async () => {
      const email = `me_${Date.now()}@example.com`;
      const password = 'TestPassword123!';

      const reg = await request(app).post('/api/auth/register').send({
        email, password, firstName: 'Test', lastName: 'User',
      });

      const token = reg.body.data.accessToken;
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(email.toLowerCase());
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid token with 401', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/auth/me', () => {
    it('should update profile fields', async () => {
      const email = `update_${Date.now()}@example.com`;
      const password = 'TestPassword123!';

      const reg = await request(app).post('/api/auth/register').send({
        email, password, firstName: 'Test', lastName: 'User',
      });

      const token = reg.body.data.accessToken;
      const res = await request(app)
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Updated', lastName: 'Name', companyName: 'NewCo', phone: '555-1234' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.first_name).toBe('Updated');
      expect(res.body.data.company_name).toBe('NewCo');
    });

    it('should reject empty update body', async () => {
      const email = `empty_${Date.now()}@example.com`;
      const password = 'TestPassword123!';

      const reg = await request(app).post('/api/auth/register').send({
        email, password, firstName: 'Test', lastName: 'User',
      });

      const token = reg.body.data.accessToken;
      const res = await request(app)
        .put('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('should change password with valid current password', async () => {
      const email = `changepw_${Date.now()}@example.com`;
      const oldPassword = 'TestPassword123!';

      const reg = await request(app).post('/api/auth/register').send({
        email, password: oldPassword, firstName: 'Test', lastName: 'User',
      });

      const token = reg.body.data.accessToken;
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: oldPassword, newPassword: 'NewPassword456!' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify old password no longer works
      const loginOld = await request(app).post('/api/auth/login').send({
        email, password: oldPassword,
      });
      expect(loginOld.status).toBe(401);

      // Verify new password works
      const loginNew = await request(app).post('/api/auth/login').send({
        email, password: 'NewPassword456!',
      });
      expect(loginNew.status).toBe(200);
    });

    it('should reject incorrect current password', async () => {
      const email = `badpw_${Date.now()}@example.com`;
      const password = 'TestPassword123!';

      const reg = await request(app).post('/api/auth/register').send({
        email, password, firstName: 'Test', lastName: 'User',
      });

      const token = reg.body.data.accessToken;
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrong', newPassword: 'NewPassword456!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject weak new password', async () => {
      const email = `weakpw_${Date.now()}@example.com`;
      const password = 'TestPassword123!';

      const reg = await request(app).post('/api/auth/register').send({
        email, password, firstName: 'Test', lastName: 'User',
      });

      const token = reg.body.data.accessToken;
      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: password, newPassword: '123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should return success even for non-existent email (security)', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' });

      // Should not leak whether email exists
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reject invalid or expired token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'invalid-token', password: 'NewPassword123!' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject weak password on reset', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'some-token', password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
