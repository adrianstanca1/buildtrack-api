import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query, pool, transaction } from '../config/database.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { generateAccessToken, generateRefreshToken, hashRefreshToken } from '../utils/jwt.js';
import { hashPassword, comparePassword, validatePassword } from '../utils/password.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { auditLog } from '../utils/audit.js';
import { invalidateUserCache } from '../config/redis.js';
import { sendEmail } from '../utils/sendEmail.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  companyName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(1, 'Password is required'),
});

// Reset tokens expire 1 hour after issue. Adjust here only — don't
// duplicate the constant in the validation/cleanup paths.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               companyName: { type: string }
 *     responses:
 *       201:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already exists
 */
router.post('/register', validate(registerSchema), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { email, password, firstName, lastName, companyName } = req.body;

    // Validate password strength
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      await client.query('ROLLBACK');
      return errorResponse(res, pwCheck.errors[0], 'VALIDATION_ERROR', 400, pwCheck.errors);
    }

    // Check if user exists
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 'Email already registered', 'CONFLICT', 409);
    }

    const passwordHash = await hashPassword(password);
    const userId = uuidv4();

    await client.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, company_name, subscription_tier, subscription_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, email.toLowerCase(), passwordHash, firstName || null, lastName || null, companyName || null, 'free', 'inactive']
    );

    // Create tokens
    const payload = { userId, email: email.toLowerCase(), role: 'user' };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const tokenHash = hashRefreshToken(refreshToken);
    await client.query(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [uuidv4(), userId, tokenHash, refreshExpiry]
    );

    // Set cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const result = await client.query(
      'SELECT id, email, first_name, last_name, role, company_name, subscription_tier, subscription_status, created_at FROM users WHERE id = $1',
      [userId]
    );

    await client.query('COMMIT');

    await auditLog({
      userId,
      eventType: 'REGISTER',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      details: { email: email.toLowerCase() },
    });

    successResponse(res, {
      user: result.rows[0],
      accessToken,
    }, 201);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Auth] Register error:', err);
    await auditLog({
      eventType: 'REGISTER',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: false,
      details: { error: String(err) },
    });
    errorResponse(res, 'Failed to create account', 'INTERNAL_ERROR', 500);
  } finally {
    client.release();
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await query(
      'SELECT id, email, password_hash, first_name, last_name, role, company_name, subscription_tier, subscription_status, avatar_url, phone FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      await auditLog({
        eventType: 'LOGIN',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        success: false,
        details: { email: email.toLowerCase(), reason: 'user_not_found' },
      });
      return errorResponse(res, 'Invalid email or password', 'UNAUTHORIZED', 401);
    }

    const user = result.rows[0];
    const validPassword = await comparePassword(password, user.password_hash);

    if (!validPassword) {
      await auditLog({
        eventType: 'LOGIN',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        success: false,
        details: { email: user.email, reason: 'invalid_password' },
      });
      return errorResponse(res, 'Invalid email or password', 'UNAUTHORIZED', 401);
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const tokenHash = hashRefreshToken(refreshToken);
    await query(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [uuidv4(), user.id, tokenHash, refreshExpiry]
    );

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await auditLog({
      userId: user.id,
      eventType: 'LOGIN',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      details: { email: user.email },
    });

    successResponse(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        companyName: user.company_name,
        subscriptionTier: user.subscription_tier,
        subscriptionStatus: user.subscription_status,
        avatarUrl: user.avatar_url,
        phone: user.phone,
      },
      accessToken,
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    errorResponse(res, 'Login failed', 'INTERNAL_ERROR', 500);
  }
});

// ─── Refresh Token ──────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const client = await pool.connect();
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return errorResponse(res, 'Refresh token required', 'UNAUTHORIZED', 401);
    }

    const { verifyRefreshToken } = await import('../utils/jwt.js');
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return errorResponse(res, 'Invalid refresh token', 'UNAUTHORIZED', 401);
    }

    // Check if refresh token exists in database (using hash)
    const tokenHash = hashRefreshToken(refreshToken);
    const tokenResult = await client.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()',
      [tokenHash, decoded.userId]
    );

    if (tokenResult.rows.length === 0) {
      return errorResponse(res, 'Invalid or expired refresh token', 'UNAUTHORIZED', 401);
    }

    await client.query('BEGIN');

    // Delete old token (using hash), insert new — atomic to prevent race
    await client.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    const payload = { userId: decoded.userId, email: decoded.email, role: decoded.role };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const newTokenHash = hashRefreshToken(newRefreshToken);
    await client.query(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
      [uuidv4(), decoded.userId, newTokenHash, newExpiry]
    );

    await client.query('COMMIT');

    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await auditLog({
      userId: decoded.userId,
      eventType: 'REFRESH',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      details: { email: decoded.email },
    });

    successResponse(res, { accessToken: newAccessToken });
  } catch (err) {
    console.error('[Auth] Refresh error:', err);
    errorResponse(res, 'Token refresh failed', 'INTERNAL_ERROR', 500);
  }
});

// ─── Logout ──────────────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    let userId: string | null = null;
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      const result = await query(
        'SELECT user_id FROM refresh_tokens WHERE token_hash = $1',
        [tokenHash]
      );
      if (result.rows.length > 0) {
        userId = result.rows[0].user_id;
      }
      await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    if (userId) {
      await invalidateUserCache(userId);
    }

    await auditLog({
      userId: userId || undefined,
      eventType: 'LOGOUT',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
    });

    successResponse(res, { message: 'Logged out successfully' });
  } catch (err) {
    console.error('[Auth] Logout error:', err);
    errorResponse(res, 'Logout failed', 'INTERNAL_ERROR', 500);
  }
});

// ─── Get Current User ───────────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, role, company_name, phone,
              subscription_tier, subscription_status, avatar_url, created_at
       FROM users WHERE id = $1`,
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 'User not found', 'NOT_FOUND', 404);
    }

    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Auth] Get me error:', err);
    errorResponse(res, 'Failed to get user', 'INTERNAL_ERROR', 500);
  }
});

// ─── Update Profile ─────────────────────────────────────────────────────
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, companyName, phone, pushToken, pushPlatform } = req.body;
    const userId = req.user!.id;

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (firstName !== undefined) { updates.push(`first_name = $${idx++}`); values.push(firstName); }
    if (lastName !== undefined) { updates.push(`last_name = $${idx++}`); values.push(lastName); }
    if (companyName !== undefined) { updates.push(`company_name = $${idx++}`); values.push(companyName); }
    if (phone !== undefined) { updates.push(`phone = $${idx++}`); values.push(phone); }
    if (pushToken !== undefined) { updates.push(`push_token = $${idx++}`); values.push(pushToken); }
    if (pushPlatform !== undefined) { updates.push(`push_platform = $${idx++}`); values.push(pushPlatform); }

    if (updates.length === 0) {
      return errorResponse(res, 'No fields to update', 'VALIDATION_ERROR', 400);
    }

    values.push(userId);
    const sql = `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
    const result = await query(sql, values);

    // Invalidate cache since profile changed
    await invalidateUserCache(userId);

    successResponse(res, result.rows[0]);
  } catch (err) {
    console.error('[Auth] Update me error:', err);
    errorResponse(res, 'Failed to update profile', 'INTERNAL_ERROR', 500);
  }
});

// ─── Change Password ──────────────────────────────────────────────────────
router.post('/change-password', authenticateToken, validate(changePasswordSchema), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return errorResponse(res, 'User not found', 'NOT_FOUND', 404);
    }

    const validCurrent = await comparePassword(currentPassword, userResult.rows[0].password_hash);
    if (!validCurrent) {
      await auditLog({
        userId,
        eventType: 'CHANGE_PASSWORD',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        success: false,
        details: { reason: 'invalid_current_password' },
      });
      return errorResponse(res, 'Current password is incorrect', 'UNAUTHORIZED', 401);
    }

    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      return errorResponse(res, pwCheck.errors[0], 'VALIDATION_ERROR', 400, pwCheck.errors);
    }

    const newHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);

    // Revoke all refresh tokens
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    await invalidateUserCache(userId);

    await auditLog({
      userId,
      eventType: 'CHANGE_PASSWORD',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
    });

    successResponse(res, { message: 'Password changed successfully' });
  } catch (err) {
    console.error('[Auth] Change password error:', err);
    errorResponse(res, 'Failed to change password', 'INTERNAL_ERROR', 500);
  }
});

// ─── Forgot Password ──────────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     description: |
 *       Always returns 200 success regardless of whether the email is registered
 *       (prevents account enumeration). If the email exists, a single-use reset
 *       token is generated, hashed (SHA-256) and stored with a 1-hour TTL; the
 *       raw token is sent to the user via email (currently logged for dev).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Reset link will be sent if the account exists
 *       400:
 *         description: Invalid email format
 */
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body;
    const normalised = email.toLowerCase();

    const userResult = await query('SELECT id FROM users WHERE email = $1', [normalised]);
    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;

      // Generate raw token (delivered to user via email) + store its
      // SHA-256 hash. Hashing means a DB compromise can't grant resets.
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

      await query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [userId, tokenHash, expiresAt]
      );

      const appUrl = process.env.APP_URL || 'https://buildtrack.cortexbuildpro.com';
      const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

      try {
        await sendEmail({
          to: normalised,
          subject: 'Reset your BuildTrack password',
          text: `Click the link below to reset your password. This link expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request a password reset, you can safely ignore this email.`,
          html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request a password reset, you can safely ignore this email.</p>`,
        });
      } catch (emailErr) {
        logger.error('[Auth] Failed to send reset email to ' + normalised, emailErr);
      }

      if (process.env.NODE_ENV !== 'production') {
        // Dev-only: surfacing the URL aids local testing. Logging in production
        // would persist a live reset token to PM2 log files.
        logger.info(`[Auth] Password reset for ${normalised} → ${resetUrl}`);
      } else {
        logger.info(`[Auth] Password reset requested for ${normalised}`);
      }

      await auditLog({
        userId,
        eventType: 'PASSWORD_RESET_REQUESTED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        success: true,
      });
    }

    // Always 200 — same response shape for "user exists" and "user doesn't" —
    // so callers can't enumerate accounts.
    successResponse(res, {
      message: 'If an account exists for that email, a reset link has been sent.',
    });
  } catch (err) {
    console.error('[Auth] Forgot password error:', err);
    errorResponse(res, 'Failed to process password reset', 'INTERNAL_ERROR', 500);
  }
});

// ─── Reset Password ──────────────────────────────────────────────────────
/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Complete password reset using a token from /forgot-password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid/expired/used token, or password fails strength check
 */
router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  try {
    const { token, password } = req.body;

    // Validate password strength BEFORE checking the token. We don't
    // want to leak token validity by short-circuiting on weak passwords.
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      return errorResponse(res, pwCheck.errors[0], 'VALIDATION_ERROR', 400, pwCheck.errors);
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const tokenResult = await query(
      'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1',
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return errorResponse(res, 'Invalid or expired token', 'VALIDATION_ERROR', 400);
    }

    const tokenRow = tokenResult.rows[0];
    if (tokenRow.used_at) {
      return errorResponse(res, 'Token already used', 'VALIDATION_ERROR', 400);
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      return errorResponse(res, 'Token expired', 'VALIDATION_ERROR', 400);
    }

    const newHash = await hashPassword(password);

    // Atomic: rotate password, burn the used token + any sibling pending
    // tokens for the same user, revoke all refresh sessions.
    await transaction(async (client) => {
      await client.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, tokenRow.user_id]
      );
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
        [tokenRow.user_id]
      );
      await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [tokenRow.user_id]);
    });

    await invalidateUserCache(tokenRow.user_id);

    await auditLog({
      userId: tokenRow.user_id,
      eventType: 'PASSWORD_RESET',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
    });

    successResponse(res, { message: 'Password reset successfully' });
  } catch (err) {
    console.error('[Auth] Reset password error:', err);
    errorResponse(res, 'Failed to reset password', 'INTERNAL_ERROR', 500);
  }
});

// ─── Root route redirect ──────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.redirect('/api/docs');
});

export { router as authRouter };
