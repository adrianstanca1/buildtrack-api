import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject } from './utils/fixtures';

describe('Invoices Routes', () => {
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

  describe('GET /api/invoices', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/invoices');
      expect(res.status).toBe(401);
    });

    it('should list invoices', async () => {
      const res = await request(app)
        .get('/api/invoices')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('POST /api/invoices', () => {
    it('should create an invoice', async () => {
      const project = await createTestProject(userId);
      const res = await request(app)
        .post('/api/invoices')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          invoiceNumber: `INV-${Date.now()}`,
          supplier: 'ABC Supplies',
          notes: 'Concrete delivery',
          amount: 5000,
          status: 'sent',
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        });
      expect([201, 200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });
  });
});
