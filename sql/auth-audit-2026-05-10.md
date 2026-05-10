# BuildTrack Authentication Security & Performance Audit
*Generated: 2026-05-10*

---

## 🔴 Critical Issues (Fix Immediately)

### 1. JWT_SECRET Hardcoded Fallback
**File:** `src/utils/jwt.ts`
**Severity:** CRITICAL

```typescript
const JWT_SECRET = process.env.JWT_SECRET || 'buildtrack-dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'buildtrack-dev-refresh-secret';
```

**Problem:** If `JWT_SECRET` is not set in production, the app falls back to a hardcoded, publicly known secret. Any attacker who reads the source code can forge tokens.

**Fix:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
if (!JWT_REFRESH_SECRET) {
  throw new Error('JWT_REFRESH_SECRET environment variable is required');
}
```

---

### 2. Refresh Tokens Stored in Plain Text
**File:** `src/routes/auth.ts`
**Severity:** CRITICAL

```typescript
await query('INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)', [uuidv4(), userId, refreshToken, refreshExpiry]);
```

**Problem:** The full `refreshToken` JWT is stored in plain text in PostgreSQL. If the database is compromised, all refresh tokens are stolen and can be used to generate new access tokens.

**Fix:** Store a SHA-256 hash of the token:
```typescript
import crypto from 'crypto';

const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
await query('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)', [uuidv4(), userId, tokenHash, refreshExpiry]);

// On refresh, hash the incoming token and compare:
const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
const result = await query('SELECT * FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()', [tokenHash, decoded.userId]);
```

**Migration needed:**
```sql
ALTER TABLE refresh_tokens ADD COLUMN token_hash VARCHAR(64);
UPDATE refresh_tokens SET token_hash = encode(digest(token, 'sha256'), 'hex');
ALTER TABLE refresh_tokens DROP COLUMN token;
CREATE UNIQUE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

---

### 3. No Brute Force Protection on Login
**File:** `src/routes/auth.ts`
**Severity:** CRITICAL

**Problem:** The login endpoint has no rate limiting or account lockout. An attacker can attempt unlimited password guesses.

**Current rate limit:** 100 requests per 15 minutes across ALL `/api/` endpoints.
**Needed:** Separate, stricter limit for auth endpoints.

**Fix:**
```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: { message: 'Too many login attempts. Try again later.', code: 'RATE_LIMITED' },
    });
  },
});

// Apply to login/register only
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => { ... });
router.post('/register', authLimiter, validate(registerSchema), async (req, res) => { ... });
```

**Also add account lockout:**
```sql
ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMP;
```

---

### 4. Web App Stores Token in localStorage (XSS)
**File:** `buildtrack-web/src/lib/api.ts`, `buildtrack-web/src/app/(auth)/login/page.tsx`
**Severity:** CRITICAL

```typescript
localStorage.setItem('accessToken', res.data.data.accessToken);
```

**Problem:** localStorage is vulnerable to XSS attacks. Any injected script can read `localStorage.getItem('accessToken')` and exfiltrate the token.

**Fix:** Use httpOnly cookies (already set by server) — don't store token in localStorage:
```typescript
// REMOVE from login/register:
// localStorage.setItem('accessToken', ...)

// The server already sets httpOnly cookies:
// res.cookie('accessToken', accessToken, { httpOnly: true, secure: true, sameSite: 'strict' });

// Axios interceptor should NOT read from localStorage:
api.interceptors.request.use((config) => {
  // REMOVE: const token = localStorage.getItem('accessToken');
  // Cookies are automatically sent by the browser
  return config;
});
```

**Middleware fix:**
```typescript
// Current middleware checks cookies but client doesn't set them:
const token = request.cookies.get('accessToken')?.value; // ✅ This is correct
// But the login page sets localStorage instead of relying on cookies
```

---

### 5. Token Refresh Race Condition
**File:** `buildtrack-web/src/lib/api.ts`
**Severity:** HIGH

```typescript
if (error.response?.status === 401 && !originalRequest._retry) {
  originalRequest._retry = true;
  try {
    const refreshResponse = await axios.post(...);
    // ...
  }
}
```

**Problem:** If multiple API calls fail with 401 simultaneously (e.g., page load with multiple requests), each will trigger a separate refresh call. The first refresh invalidates the old refresh token, causing subsequent refreshes to fail.

**Fix:** Use a promise queue for refresh:
```typescript
let refreshPromise: Promise<string> | null = null;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // Queue all refresh requests behind a single promise
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken();
      }
      
      try {
        const newToken = await refreshPromise;
        originalRequest.headers.set('Authorization', `Bearer ${newToken}`);
        return api(originalRequest);
      } catch {
        window.location.href = '/login';
      } finally {
        refreshPromise = null;
      }
    }
    return Promise.reject(error);
  }
);

async function refreshAccessToken(): Promise<string> {
  const res = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {}, { withCredentials: true });
  return res.data.data.accessToken;
}
```

---

### 6. `authenticateToken` Middleware Queries DB on Every Request
**File:** `src/middleware/auth.ts`
**Severity:** HIGH

```typescript
const result = await pool.query('SELECT id, email, role, first_name, last_name FROM users WHERE id = $1', [decoded.userId]);
```

**Problem:** Every authenticated API call incurs a database query to verify the user still exists. At scale (1000 req/s), this becomes a bottleneck.

**Fix Options:**

**Option A: Redis cache (recommended)**
```typescript
import redis from '../config/redis.js';

const cacheKey = `user:${decoded.userId}`;
let user = await redis.get(cacheKey);

if (!user) {
  const result = await pool.query('SELECT id, email, role, first_name, last_name FROM users WHERE id = $1', [decoded.userId]);
  if (result.rows.length === 0) { /* reject */ }
  user = result.rows[0];
  await redis.setex(cacheKey, 300, JSON.stringify(user)); // 5 min TTL
} else {
  user = JSON.parse(user);
}
```

**Option B: Include user data in JWT (with shorter expiry)**
```typescript
// JWT payload already has userId, email, role
// Just verify signature — trust the token for 15m
// Check DB only for critical operations (password change, delete, admin)
```

---

## 🟡 Medium Issues

### 7. Registration Creates Tokens Before User Commit
**File:** `src/routes/auth.ts`
**Severity:** MEDIUM

**Problem:** If the `INSERT INTO users` fails (e.g., race condition, DB error), tokens are still created but point to a non-existent user.

**Fix:** Use database transaction:
```typescript
import { transaction } from '../config/database.js';

router.post('/register', validate(registerSchema), async (req, res) => {
  try {
    await transaction(async (client) => {
      const userResult = await client.query('INSERT INTO users (...) VALUES (...) RETURNING id', [...]);
      const userId = userResult.rows[0].id;
      
      const payload = { userId, email: email.toLowerCase(), role: 'user' };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);
      
      await client.query('INSERT INTO refresh_tokens (...) VALUES (...)', [...]);
      
      // Only commit if all succeed
      // Return tokens
    });
  } catch (err) { ... }
});
```

---

### 8. Login Performs 2 Sequential DB Queries
**File:** `src/routes/auth.ts`
**Severity:** MEDIUM

```typescript
// Query 1: Get user + password hash
const result = await query('SELECT ... FROM users WHERE email = $1', [email]);

// ... bcrypt compare, token generation ...

// Query 2: Insert refresh token
await query('INSERT INTO refresh_tokens ...', [...]);
```

**Fix:** Could combine into single transaction. Also, the user data query could be cached in Redis.

---

### 9. No Token Expiry Check Before API Calls
**File:** `buildtrack-web/src/lib/api.ts`
**Severity:** MEDIUM

**Problem:** The client sends requests with potentially expired tokens. The server returns 401, then the client refreshes. This adds an extra round-trip per expired token.

**Fix:** Check token expiry client-side:
```typescript
function isTokenExpiringSoon(token: string, bufferSeconds = 60): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 - Date.now() < bufferSeconds * 1000;
  } catch {
    return true;
  }
}

// In request interceptor:
const token = localStorage.getItem('accessToken');
if (token && isTokenExpiringSoon(token)) {
  // Proactively refresh before request
  await refreshAccessToken();
}
```

---

### 10. Cookie `secure` Flag Depends on NODE_ENV
**File:** `src/routes/auth.ts`
**Severity:** MEDIUM

```typescript
res.cookie('accessToken', accessToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
});
```

**Problem:** If `NODE_ENV` is not set to 'production' (e.g., misconfigured deployment), cookies won't have the `secure` flag and will be sent over HTTP.

**Fix:** Fail closed:
```typescript
const isSecure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true';
```

---

### 11. No Audit Log for Auth Events
**File:** `src/routes/auth.ts`
**Severity:** MEDIUM

**Problem:** Failed logins, password changes, token refreshes are not logged for security monitoring.

**Fix:** Add audit logging:
```typescript
await query('INSERT INTO activity_logs (user_id, action, entity_type, metadata) VALUES ($1, $2, $3, $4)', [
  userId,
  'login',
  'user',
  JSON.stringify({ ip: req.ip, userAgent: req.headers['user-agent'] }),
]);
```

---

## 🟢 Low Issues

### 12. Password Validation is Overly Strict
**File:** `src/utils/password.ts`
**Severity:** LOW

```typescript
if (!/[^a-zA-Z0-9]/.test(password)) {
  errors.push('Password must contain a special character');
}
```

**Problem:** Special characters include spaces and control characters. Some valid passwords (e.g., passphrases with spaces) are rejected.

**Fix:** Use NIST guidelines — minimum length, no complexity requirements:
```typescript
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }
  // Remove complexity requirements per NIST SP 800-63B
  return { valid: errors.length === 0, errors };
}
```

---

### 13. No Device/Session Tracking
**File:** `src/routes/auth.ts`
**Severity:** LOW

**Problem:** Cannot revoke tokens by device or see active sessions.

**Fix:** Add device info to refresh_tokens:
```sql
ALTER TABLE refresh_tokens ADD COLUMN user_agent TEXT;
ALTER TABLE refresh_tokens ADD COLUMN ip_address INET;
ALTER TABLE refresh_tokens ADD COLUMN device_name TEXT;
```

---

## 📊 Performance Analysis

| Operation | Queries | Est. Time | Bottleneck |
|-----------|---------|-----------|------------|
| Login | 2 DB + bcrypt + 2 JWT | ~150ms | bcrypt (~100ms) |
| Register | 2 DB + bcrypt + 2 JWT | ~150ms | bcrypt (~100ms) |
| Token Refresh | 2 DB + 2 JWT | ~50ms | JWT sign |
| Auth Middleware | 1 DB + JWT verify | ~6ms | DB query |
| Logout | 1 DB | ~5ms | — |

**Target:** Login should be <100ms p95.
**Current:** ~150ms (bcrypt dominates).

**Optimizations:**
1. Cache user data in Redis (eliminates auth middleware DB query)
2. Use transaction for register/login (eliminates extra round-trip)
3. Consider Argon2id instead of bcrypt (better performance at same security)

---

## 🛡️ Recommended Priority Fixes

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| P0 | Remove JWT_SECRET fallback | 5 min | Prevents token forgery |
| P0 | Hash refresh tokens in DB | 30 min | Prevents DB breach → session hijack |
| P0 | Add auth-specific rate limiting | 15 min | Prevents brute force |
| P0 | Stop storing tokens in localStorage | 30 min | Prevents XSS token theft |
| P1 | Fix token refresh race condition | 20 min | Prevents refresh failures |
| P1 | Cache user data in Redis | 1 hour | Reduces auth overhead ~6ms → ~1ms |
| P2 | Add account lockout | 1 hour | Prevents credential stuffing |
| P2 | Add audit logging | 30 min | Security monitoring |
| P3 | NIST password guidelines | 10 min | Better UX, same security |

---

## ✅ What Works Well

1. **JWT signature verification** with DB user existence check — defense-in-depth
2. **Refresh token rotation** — old token invalidated on refresh
3. **httpOnly cookies** — prevents XSS (but client doesn't use them)
4. **sameSite: 'strict'** — CSRF protection
5. **bcrypt with 12 rounds** — secure password hashing
6. **Token expiry** — 15m access, 7d refresh
7. **Logout token revocation** — refresh token deleted on logout
8. **Zod validation** on register/login inputs
