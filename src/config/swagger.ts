import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BuildTrack API',
      version: '2.0.0',
      description: 'Construction management API with projects, tasks, workers, safety, and admin features.',
      contact: {
        name: 'BuildTrack Support',
        url: 'https://buildtrack.cortexbuildpro.com',
      },
    },
    servers: [
      { url: 'http://localhost:3001', description: 'Local development' },
      { url: 'https://buildtrack-api.cortexbuildpro.com', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['user', 'admin', 'super_admin'] },
            avatarUrl: { type: 'string' },
            companyName: { type: 'string' },
            subscriptionTier: { type: 'string', enum: ['free', 'pro', 'enterprise'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Project: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            location: { type: 'string' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            budget: { type: 'number' },
            spent: { type: 'number' },
            progress: { type: 'integer', minimum: 0, maximum: 100 },
            status: { type: 'string', enum: ['planning', 'active', 'on-hold', 'completed', 'cancelled'] },
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
            color: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Task: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            assignedTo: { type: 'string', format: 'uuid' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            status: { type: 'string', enum: ['pending', 'in-progress', 'completed'] },
            dueDate: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Worker: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['foreman', 'electrician', 'plumber', 'carpenter', 'mason', 'laborer', 'engineer', 'safety-officer'] },
            status: { type: 'string', enum: ['active', 'off-duty', 'on-leave'] },
            phone: { type: 'string' },
            email: { type: 'string' },
            hourlyRate: { type: 'number' },
            weeklyHours: { type: 'integer' },
            certifications: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Incident: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            incidentDate: { type: 'string', format: 'date-time' },
            injuries: { type: 'integer' },
            photos: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Inspection: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            projectId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'passed', 'failed'] },
            inspectionDate: { type: 'string', format: 'date-time' },
            inspector: { type: 'string' },
            findings: { type: 'string' },
            photos: { type: 'array', items: { type: 'string' } },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            body: { type: 'string' },
            type: { type: 'string' },
            relatedId: { type: 'string' },
            read: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {},
            error: { type: 'object' },
            meta: { type: 'object' },
          },
        },
      },
    },
  },
  apis: ['src/routes/*.ts', 'src/server.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
