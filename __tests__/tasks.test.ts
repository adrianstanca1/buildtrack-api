import request from 'supertest';
import { createApp } from './utils/testApp';
import { createTestUser, createTestProject, createTestTask } from './utils/fixtures';

describe('Tasks Routes', () => {
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

  describe('GET /api/tasks', () => {
    it('should list tasks for authenticated user', async () => {
      const project = await createTestProject(userId);
      await createTestTask(project.id, { title: 'Task A' });
      await createTestTask(project.id, { title: 'Task B' });

      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it('should filter by projectId', async () => {
      const project1 = await createTestProject(userId);
      const project2 = await createTestProject(userId);
      await createTestTask(project1.id, { title: 'Task 1' });
      await createTestTask(project2.id, { title: 'Task 2' });

      const res = await request(app)
        .get(`/api/tasks?projectId=${project1.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Task 1');
    });

    it('should filter by status', async () => {
      const project = await createTestProject(userId);
      await createTestTask(project.id, { title: 'Done', status: 'completed' });
      await createTestTask(project.id, { title: 'Pending', status: 'pending' });

      const res = await request(app)
        .get('/api/tasks?status=completed')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Done');
    });

    it('should filter by priority', async () => {
      const project = await createTestProject(userId);
      await createTestTask(project.id, { title: 'Urgent', priority: 'urgent' });
      await createTestTask(project.id, { title: 'Low', priority: 'low' });

      const res = await request(app)
        .get('/api/tasks?priority=urgent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Urgent');
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/tasks');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a task with project', async () => {
      const project = await createTestProject(userId);

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: project.id,
          title: 'New Task',
          description: 'Task description',
          priority: 'high',
          status: 'pending',
          dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('New Task');
      expect(res.body.data.project_id).toBe(project.id);
      expect(res.body.data.priority).toBe('high');
    });

    it('should reject task for project owned by another user', async () => {
      const otherUser = await createTestUser();
      const project = await createTestProject(otherUser.id);

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ projectId: project.id, title: 'Hacked Task' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing title', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ description: 'No title' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('should get task by id', async () => {
      const project = await createTestProject(userId);
      const task = await createTestTask(project.id, { title: 'Detail Task' });

      const res = await request(app)
        .get(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Detail Task');
      expect(res.body.data).toHaveProperty('project_name');
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .get('/api/tasks/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('should update task fields', async () => {
      const project = await createTestProject(userId);
      const task = await createTestTask(project.id, { title: 'Old Title' });

      const res = await request(app)
        .put(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated Title', priority: 'urgent', status: 'in-progress' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Title');
      expect(res.body.data.priority).toBe('urgent');
      expect(res.body.data.status).toBe('in-progress');
    });

    it('should reject empty update body', async () => {
      const project = await createTestProject(userId);
      const task = await createTestTask(project.id);

      const res = await request(app)
        .put(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .put('/api/tasks/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should delete a task', async () => {
      const project = await createTestProject(userId);
      const task = await createTestTask(project.id);

      const res = await request(app)
        .delete(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const get = await request(app)
        .get(`/api/tasks/${task.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(get.status).toBe(404);
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .delete('/api/tasks/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/tasks/:id/complete', () => {
    it('should mark task as completed', async () => {
      const project = await createTestProject(userId);
      const task = await createTestTask(project.id, { status: 'in-progress' });

      const res = await request(app)
        .post(`/api/tasks/${task.id}/complete`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.completed_at).toBeDefined();
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app)
        .post('/api/tasks/00000000-0000-0000-0000-000000000000/complete')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
