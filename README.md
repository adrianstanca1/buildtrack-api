# BuildTrack API

Construction management backend API powering the BuildTrack SaaS platform.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ / 22 |
| Framework | Express 5 |
| Database | PostgreSQL (node-postgres) |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Real-time | Socket.IO |
| File Uploads | Multer |
| Validation | Zod |
| Security | Helmet, CORS, express-rate-limit |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create database
createdb buildtrack

# 3. Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials and JWT secrets

# 4. Run schema + seed
npm run db:schema
npm run db:seed

# 5. Start development server
npm run dev

# 6. Build for production
npm run build
npm start
```

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `DATABASE_URL` | Yes | `postgresql://...` |
| `JWT_SECRET` | Yes | — |
| `JWT_REFRESH_SECRET` | Yes | — |
| `PORT` | No | `3001` |
| `CORS_ORIGIN` | No | `*` |
| `RATE_LIMIT_MAX` | No | `100` |
| `UPLOAD_DIR` | No | `./uploads` |

## API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Create account |
| POST | `/api/auth/login` | — | Login |
| POST | `/api/auth/refresh` | — | Refresh access token |
| POST | `/api/auth/logout` | ✓ | Logout |
| GET | `/api/auth/me` | ✓ | Current user |
| PUT | `/api/auth/me` | ✓ | Update profile |
| POST | `/api/auth/change-password` | ✓ | Change password |

### Projects
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/projects` | ✓ | List projects |
| POST | `/api/projects` | ✓ | Create project |
| GET | `/api/projects/:id` | ✓ | Get project + relations |
| PUT | `/api/projects/:id` | ✓ | Update project |
| DELETE | `/api/projects/:id` | ✓ | Delete project |
| GET | `/api/projects/:id/stats` | ✓ | Project stats |
| POST | `/api/projects/:id/workers` | ✓ | Assign workers |
| DELETE | `/api/projects/:id/workers/:workerId` | ✓ | Remove worker |

### Tasks
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/tasks` | ✓ | List tasks |
| POST | `/api/tasks` | ✓ | Create task |
| GET | `/api/tasks/:id` | ✓ | Get task |
| PUT | `/api/tasks/:id` | ✓ | Update task |
| DELETE | `/api/tasks/:id` | ✓ | Delete task |
| POST | `/api/tasks/:id/complete` | ✓ | Mark complete |

### Workers
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/workers` | ✓ | List workers |
| POST | `/api/workers` | ✓ | Create worker |
| GET | `/api/workers/:id` | ✓ | Get worker |
| PUT | `/api/workers/:id` | ✓ | Update worker |
| DELETE | `/api/workers/:id` | ✓ | Delete worker |

### Safety
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/safety/incidents` | ✓ | List incidents |
| POST | `/api/safety/incidents` | ✓ | Create incident |
| GET | `/api/safety/incidents/:id` | ✓ | Get incident |
| PUT | `/api/safety/incidents/:id` | ✓ | Update incident |
| DELETE | `/api/safety/incidents/:id` | ✓ | Delete incident |

### Inspections
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/inspections` | ✓ | List inspections |
| POST | `/api/inspections` | ✓ | Create inspection |
| GET | `/api/inspections/:id` | ✓ | Get inspection |
| PUT | `/api/inspections/:id` | ✓ | Update inspection |
| DELETE | `/api/inspections/:id` | ✓ | Delete inspection |

### Notifications
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notifications` | ✓ | List + unread count |
| PUT | `/api/notifications/:id/read` | ✓ | Mark read |
| PUT | `/api/notifications/read-all` | ✓ | Mark all read |
| DELETE | `/api/notifications/:id` | ✓ | Delete notification |

### Uploads
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/uploads` | ✓ | Single file upload |
| POST | `/api/uploads/multiple` | ✓ | Multiple files (max 10) |

### Dashboard
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dashboard/stats` | ✓ | Aggregated stats |
| GET | `/api/dashboard/activity` | ✓ | Recent activity log |

### Admin (admin/super_admin only)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/users` | ✓ | List all users |
| PUT | `/api/admin/users/:id` | ✓ | Update user role/tier |
| DELETE | `/api/admin/users/:id` | ✓ | Delete user |
| GET | `/api/admin/stats` | ✓ | Platform-wide stats |

### Health
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | — | Health check |

## Database Schema

See `sql/schema.sql` for full DDL. Key tables:
- `users` — accounts, roles, subscriptions
- `projects` — construction projects
- `tasks` — project tasks
- `workers` — workforce
- `safety_incidents` — safety reports
- `inspections` — quality inspections
- `notifications` — user notifications
- `activity_logs` — audit trail
- `project_workers` — junction table
- `refresh_tokens` — JWT refresh tokens

## WebSocket Events

Connect via Socket.IO. Rooms by `project:${projectId}`.

| Event | Direction | Description |
|-------|-----------|-------------|
| `join-project` | Client → Server | Subscribe to project updates |
| `leave-project` | Client → Server | Unsubscribe |
| `disconnect` | Server | Client disconnected |

## Scripts

```bash
npm run dev          # Development with hot reload
npm run build        # Compile TypeScript
npm start            # Run compiled JS
npm run db:schema    # Apply database schema
npm run db:seed      # Seed development data
npm run typecheck    # TypeScript check only
```

## Security

- Helmet for security headers
- CORS with configurable origins
- Rate limiting (100 req/15min default)
- JWT access/refresh token rotation
- Password hashing with bcrypt (12 rounds)
- Input validation with Zod
- File upload type/size restrictions
- Role-based access control (RBAC)

## Production

```bash
# Build
npm run build

# Start
NODE_ENV=production PORT=3001 npm start

# Or with PM2
pm2 start dist/server.js --name buildtrack-api
```

Nginx reverse proxy config provided in `nginx-buildtrack-api.conf`.

## License

MIT
