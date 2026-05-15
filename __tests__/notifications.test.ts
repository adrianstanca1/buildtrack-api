import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestNotification } from './utils/fixtures';

describe('Notifications Routes', () => {
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

  describe('GET /api/notifications', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(401);
    });

    it('should list notifications', async () => {
      await createTestNotification(userId);
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.notifications)).toBe(true);
      expect(res.body.data).toHaveProperty('unreadCount');
    });
  });

  describe('PUT /api/notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      const notif = await createTestNotification(userId);
      const res = await request(app)
        .put(`/api/notifications/${notif.id}/read`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.read).toBe(true);
    });
  });
});
