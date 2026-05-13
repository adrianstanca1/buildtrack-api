# CLAUDE.md — buildtrack-api

REST + WebSocket backend for the BuildTrack construction-management
ecosystem. Drives the BuildTrack mobile (Expo), BuildTrack-iOS (Swift),
and buildtrack-web (Next.js PWA) clients.

## Stack

- **Runtime**: Node ≥22, Express 5, TypeScript (strict, ESM)
- **DB**: PostgreSQL on the **system pg `:5432`** in prod (DB
  `buildtrack_api`, user `cortexbuild`) — NOT the docker pg `:55432`.
  Always check `/proc/<pid>/environ` against `.env` because pm2's
  `pm2.config.js` env block overrides `.env`.
- **Cache**: Redis (`ioredis`) for user cache + session invalidation
- **Object store**: MinIO via `@aws-sdk/client-s3` + presigned URLs
- **Realtime**: Socket.IO 4 (`join-project` / `leave-project` rooms)
- **Auth**: JWT access + refresh tokens. Bcrypt 12 rounds. Refresh
  tokens are SHA-256 hashed before storage (`refresh_tokens.token_hash`).
- **Payments**: Stripe 22 (subscriptions + webhooks). Raw body parser
  is mounted BEFORE `express.json` on `/api/payments/webhook` for the
  webhook signature check — never reorder these middlewares.
- **Email**: `nodemailer` (configured but `/forgot-password` currently
  logs the reset URL instead of sending — wire to Brevo/SendGrid).
- **Validation**: Zod schemas + `validate`/`validateParams`/`validateQuery`
  middleware (`src/middleware/validate.ts`).
- **Tests**: Jest 30 + supertest, 73 tests across 4 files (auth,
  projects, tasks, middleware). Test DB on supabase pg `:54322`.

## Running services

- **PM2 process**: `buildtrack-api` (id 1 in `pm2 list`), `dist/server.js`,
  fork mode, max-mem 512 MB, restart-on-OOM.
- **Port**: `:3001` (set via `PORT` in `.env`).
- **Public URL**: `https://buildtrack-api.cortexbuildpro.com`
  (nginx vhost `nginx-buildtrack-api.conf` in repo).
- **Swagger UI**: `/api/docs` (also `/` redirects there).
- **Health probes**: `/health` AND `/api/health` (identical bodies).

## Route surface (37 groups)

```
auth         projects     tasks         workers       safety
inspections  notifications dashboard    admin         uploads
defects      permits      timesheets    daily_reports team_members
rfis         drawings     invoices      submittals    risk_dashboard
project_timeline           links        guests        exports
punch_items  site_photos  delay_notes   meetings      purchase_orders
equipment    materials    change_orders budget        schedules
analytics    push         payments
```

All authenticated routes use `authenticateToken` from
`src/middleware/auth.js`. All `:id` path params are validated via
zod `.uuid()` or `validateParams(z.object({ id: z.string().uuid() }))`
before they reach Postgres — malformed UUIDs return 400, not 500.

## Response envelope

Every API response uses the `{success, data, error}` shape via
`src/utils/response.ts`:

```ts
// success
{ success: true, data: { ... }, meta?: { ... } }
// error
{ success: false, error: { message, code, details?, stack? } }
// paginated
{ success: true, data: [...], meta: { total, page, limit, totalPages } }
```

Clients should branch on `success`. The `meta` object is used for both
pagination and tap-through identifiers (e.g. last_event_id for SSE).

## How to run

```bash
# from /root/buildtrack-api
npm install                  # one-off
npm run typecheck            # tsc --noEmit
npm run build                # → dist/
npm start                    # production (uses dist/)
npm run dev                  # tsx watch (use this for hot reload)
npm test                     # jest --runInBand --forceExit (73 tests)
npm run test:coverage        # jest with v8 coverage

# DB setup (idempotent — initDatabase() runs on every boot)
npm run db:schema            # apply sql/schema.sql
npm run db:seed              # apply sql/seed.sql
npm run db:reset             # both
```

To run the live service:

```bash
NODE_OPTIONS="" pm2 restart buildtrack-api
NODE_OPTIONS="" pm2 logs buildtrack-api --lines 50
NODE_OPTIONS="" pm2 save     # IMPORTANT after restart-with-changes
```

## Test setup gotchas

- **`npm test` MUST be `--runInBand`**. The shared `buildtrack_test`
  DB is the single source of truth; parallel workers deadlock against
  each other on TRUNCATE.
- **`cleanTestDatabase()` uses DELETE not TRUNCATE** to avoid the
  ACCESS EXCLUSIVE lock deadlocking against the API pool's idle
  connections from prior tests. Order: children first.
- **`.env.test` is loaded by `__tests__/utils/loadTestEnv.ts`** (wired
  in `jest.config.js` `setupFiles`). Without it the API pool connects
  to the **production** DB during tests.
- **Test DB lives on supabase pg `:54322`** (DB `buildtrack_test`,
  user `postgres`). Create with `psql -h 127.0.0.1 -p 54322 -U postgres
  -d postgres -c "CREATE DATABASE buildtrack_test;"`.
- **Test schema mirrors `src/config/database.ts:initDatabase()`** —
  keep the two in sync when adding tables.

## Auth invariants

1. **Refresh tokens are HASHED** before storage — `token_hash` column,
   not `token`. The raw token is only ever returned to the client; the
   server-side compare is `hashRefreshToken(raw) === token_hash`.
2. **Password-reset tokens are also hashed** (SHA-256). Single-use:
   `used_at` is stamped when the token is consumed AND when any
   sibling pending token for the same user is consumed.
3. **`/forgot-password` always returns 200** regardless of whether the
   email exists. The internal branch (create-token / log-URL) only
   runs for real users — but the response shape is identical so
   clients can't enumerate accounts.
4. **Password reset always validates strength BEFORE checking token
   validity** to avoid leaking token-validity via the early-return on
   weak passwords.
5. **Auth rate-limit**: 5 attempts per 15-minute window per IP
   (`/api/auth/*`), `skipSuccessfulRequests: true`. Hit this in dev
   easily — wait or restart the process to reset.

## Multi-tenant invariants

Every entity row carries `user_id`. Routes filter with
`WHERE id = $1 AND user_id = $2` so cross-tenant reads return 404
(not 403 — don't leak existence). Confirmed across projects, tasks,
invoices, workers, equipment. When adding a new route, **never** do
`WHERE id = $1` alone; always include the tenant filter.

## Money + percent semantics

- Money: `DECIMAL(15,2)` stringified on the wire (`"5400.00"`).
- Rates: stored as `DECIMAL(5,2)` percent (20 means 20%, not 0.20).
- Always `parseFloat`/`toNum` before arithmetic in client code.

## Stripe webhook gotcha

The webhook body is verified via `stripe.webhooks.constructEvent()`
against the **raw bytes** of the request, not the parsed JSON. This is
why `src/server.ts:85` mounts `express.raw()` for
`/api/payments/webhook` BEFORE `express.json()`. Moving the
`express.json()` call earlier will silently break signature
verification with an "invalid signature" error that's painful to
diagnose.

## Idempotency

`idempotencyMiddleware` (`src/middleware/idempotency.ts`) inspects the
`Idempotency-Key` header on mutating requests and short-circuits with
the prior response if the same key was used recently. Useful for
offline-sync retries from the mobile clients. Don't disable.

## Socket.IO rooms

```ts
socket.emit('join-project', projectId)  // joins room `project:<uuid>`
socket.emit('leave-project', projectId)
```

Server-side emitters (`(global as any).io.to('project:<uuid>').emit(...)`)
broadcast to all clients in that room. Used for live task updates,
timesheet approvals, and inspection state changes.

## Known issues / open work

- **Swagger JSDoc coverage**: only auth.ts, projects.ts, tasks.ts,
  safety.ts, workers.ts have `@swagger` comments. The other 32 route
  files render in Swagger UI as undocumented paths (route shows but
  no schema). Adding JSDoc is per-route work — track it as a
  documentation-debt item.
- **`/forgot-password` doesn't actually send email** in dev — it logs
  the reset URL. Wire to Brevo (workspace-wide email provider, see
  `reference_brevo_email.md`).
- **PM2 `pm2 save` is easy to forget** after a `pm2 restart` — the new
  process state won't survive a reboot until you save. The workspace
  CLAUDE.md flags this rule globally.
- **Production DB lives on system pg `:5432`** (not docker pg `:55432`)
  — easy to misread when grepping. The `cortexbuild` user has access
  to multiple DBs on the system pg; pick the right one via the
  `?database=` URL or `DATABASE_URL` env.
- **No global pg-error → HTTP-status mapping** in `errorHandler.ts`.
  Routes catch their own errors and respond 500. If you add a new
  route, wrap DB ops in try/catch with route-specific status codes
  (don't rely on the global handler to map `22P02` etc.).

## Cross-references

- Backend source-of-truth API spec: `src/config/swagger.ts` + JSDoc in
  `src/routes/*.ts` → served at `/api/docs`.
- Frontend clients: BuildTrack (Expo, `/root/BuildTrack/`),
  BuildTrack-iOS (`/root/BuildTrack-iOS/`), buildtrack-web (`/root/buildtrack-web/`).
- Workspace overview: `/root/CLAUDE.md` "Subprojects" + "Running services".
- Email provider: `reference_brevo_email.md` in auto-memory.
- iOS shipping playbook: `reference_ios_stack_playbook.md`.
