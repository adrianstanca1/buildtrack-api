import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject, createTestTask, createTestWorker } from './utils/fixtures';

describe('Projects Routes', () => {
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

  describe('GET /api/projects', () => {
    it('should list projects for authenticated user', async () => {
      await createTestProject(userId, { name: 'Project A' });
      await createTestProject(userId, { name: 'Project B' });

      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta.total).toBe(2);
    });

    it('should filter by status', async () => {
      await createTestProject(userId, { name: 'Active Proj', status: 'active' });
      await createTestProject(userId, { name: 'Planning Proj', status: 'planning' });

      const res = await request(app)
        .get('/api/projects?status=active')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Active Proj');
    });

    it('should search by name', async () => {
      await createTestProject(userId, { name: 'Alpha Construction' });
      await createTestProject(userId, { name: 'Beta Build' });

      const res = await request(app)
        .get('/api/projects?search=Alpha')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Alpha Construction');
    });

    it('should paginate results', async () => {
      for (let i = 0; i < 5; i++) {
        await createTestProject(userId, { name: `Project ${i}` });
      }

      const res = await request(app)
        .get('/api/projects?page=1&limit=2')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.hasNext).toBe(true);
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/projects', () => {
    it('should create a new project', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Build Site',
          description: 'A test construction project',
          location: '123 Test St',
          budget: 500000,
          status: 'planning',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 90 * 86400000).toISOString(),
          color: '#ff0000',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('New Build Site');
      expect(res.body.data.user_id).toBe(userId);
      expect(res.body.data.color).toBe('#ff0000');
    });

    it('should reject missing project name', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'No name' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid status enum', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test', status: 'invalid_status' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should get project with tasks and workers', async () => {
      const project = await createTestProject(userId, { name: 'Detail Proj' });
      await createTestTask(project.id, { title: 'Task 1' });

      const res = await request(app)
        .get(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Detail Proj');
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for project owned by another user', async () => {
      const otherUser = await createTestUser();
      const project = await createTestProject(otherUser.id);

      const res = await request(app)
        .get(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/projects/:id', () => {
    it('should update project fields', async () => {
      const project = await createTestProject(userId, { name: 'Old Name' });

      const res = await request(app)
        .put(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Name', budget: 999999, progress: 50 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.budget).toBe('999999');
      expect(res.body.data.progress).toBe(50);
    });

    it('should reject update to project owned by another user', async () => {
      const otherUser = await createTestUser();
      const project = await createTestProject(otherUser.id);

      const res = await request(app)
        .put(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Hacked' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should reject empty update body', async () => {
      const project = await createTestProject(userId);

      const res = await request(app)
        .put(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should delete own project', async () => {
      const project = await createTestProject(userId);

      const res = await request(app)
        .delete(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const get = await request(app)
        .get(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(get.status).toBe(404);
    });

    it('should not delete project owned by another user', async () => {
      const otherUser = await createTestUser();
      const project = await createTestProject(otherUser.id);

      const res = await request(app)
        .delete(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/projects/:id/stats', () => {
    it('should return project statistics', async () => {
      const project = await createTestProject(userId, { budget: 100000, spent: 25000, progress: 25 });
      await createTestTask(project.id, { status: 'completed' });
      await createTestTask(project.id, { status: 'pending' });

      const res = await request(app)
        .get(`/api/projects/${project.id}/stats`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('total_tasks');
      expect(res.body.data).toHaveProperty('budget');
    });

    it('should return 404 for non-existent project stats', async () => {
      const res = await request(app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/projects/:id/workers', () => {
    it('should assign workers to project', async () => {
      const project = await createTestProject(userId);
      const worker = await createTestWorker(userId);

      const res = await request(app)
        .post(`/api/projects/${project.id}/workers`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ workerIds: [worker.id] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assigned).toBe(1);
    });

    it('should reject missing workerIds', async () => {
      const project = await createTestProject(userId);

      const res = await request(app)
        .post(`/api/projects/${project.id}/workers`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/projects/:id/workers/:workerId', () => {
    it('should remove worker from project', async () => {
      const project = await createTestProject(userId);
      const worker = await createTestWorker(userId);

      await request(app)
        .post(`/api/projects/${project.id}/workers`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ workerIds: [worker.id] });

      const res = await request(app)
        .delete(`/api/projects/${project.id}/workers/${worker.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
