import request from 'supertest';
import { createApp } from './utils/testApp';

describe('Auth Routes', () => {
  let app: Express.Application;

  beforeAll(async () => {
    app = await createApp();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: `test_${Date.now()}@example.com`,
          password: 'TestPassword123!',
          fullName: 'Test User',
        });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should reject duplicate email', async () => {
      const email = `dup_${Date.now()}@example.com`;
      await request(app).post('/api/auth/register').send({
        email, password: 'TestPassword123!', fullName: 'Test User',
      });
      
      const res = await request(app).post('/api/auth/register').send({
        email, password: 'TestPassword123!', fullName: 'Test User',
      });
      
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const email = `login_${Date.now()}@example.com`;
      const password = 'TestPassword123!';
      
      await request(app).post('/api/auth/register').send({
        email, password, fullName: 'Test User',
      });
      
      const res = await request(app).post('/api/auth/login').send({
        email, password,
      });
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should reject invalid password', async () => {
      const email = `bad_${Date.now()}@example.com`;
      await request(app).post('/api/auth/register').send({
        email, password: 'TestPassword123!', fullName: 'Test User',
      });
      
      const res = await request(app).post('/api/auth/login').send({
        email, password: 'wrongpassword',
      });
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
