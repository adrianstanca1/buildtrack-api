"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const uuid_1 = require("uuid");
const database_js_1 = require("../config/database.js");
const validate_js_1 = require("../middleware/validate.js");
const auth_js_1 = require("../middleware/auth.js");
const jwt_js_1 = require("../utils/jwt.js");
const password_js_1 = require("../utils/password.js");
const response_js_1 = require("../utils/response.js");
const audit_js_1 = require("../utils/audit.js");
const redis_js_1 = require("../config/redis.js");
const router = (0, express_1.Router)();
exports.authRouter = router;
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    firstName: zod_1.z.string().min(1, 'First name is required').optional(),
    lastName: zod_1.z.string().min(1, 'Last name is required').optional(),
    companyName: zod_1.z.string().optional(),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
const changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1, 'Current password is required'),
    newPassword: zod_1.z.string().min(8, 'New password must be at least 8 characters'),
});
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
router.post('/register', (0, validate_js_1.validate)(registerSchema), async (req, res) => {
    const client = await database_js_1.pool.connect();
    try {
        await client.query('BEGIN');
        const { email, password, firstName, lastName, companyName } = req.body;
        // Validate password strength
        const pwCheck = (0, password_js_1.validatePassword)(password);
        if (!pwCheck.valid) {
            await client.query('ROLLBACK');
            return (0, response_js_1.errorResponse)(res, pwCheck.errors[0], 'VALIDATION_ERROR', 400, pwCheck.errors);
        }
        // Check if user exists
        const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            await client.query('ROLLBACK');
            return (0, response_js_1.errorResponse)(res, 'Email already registered', 'CONFLICT', 409);
        }
        const passwordHash = await (0, password_js_1.hashPassword)(password);
        const userId = (0, uuid_1.v4)();
        await client.query(`INSERT INTO users (id, email, password_hash, first_name, last_name, company_name, subscription_tier, subscription_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [userId, email.toLowerCase(), passwordHash, firstName || null, lastName || null, companyName || null, 'free', 'inactive']);
        // Create tokens
        const payload = { userId, email: email.toLowerCase(), role: 'user' };
        const accessToken = (0, jwt_js_1.generateAccessToken)(payload);
        const refreshToken = (0, jwt_js_1.generateRefreshToken)(payload);
        // Store refresh token
        const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const tokenHash = (0, jwt_js_1.hashRefreshToken)(refreshToken);
        await client.query('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)', [(0, uuid_1.v4)(), userId, tokenHash, refreshExpiry]);
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
        const result = await client.query('SELECT id, email, first_name, last_name, role, company_name, subscription_tier, subscription_status, created_at FROM users WHERE id = $1', [userId]);
        await client.query('COMMIT');
        await (0, audit_js_1.auditLog)({
            userId,
            eventType: 'REGISTER',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            success: true,
            details: { email: email.toLowerCase() },
        });
        (0, response_js_1.successResponse)(res, {
            user: result.rows[0],
            accessToken,
        }, 201);
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('[Auth] Register error:', err);
        await (0, audit_js_1.auditLog)({
            eventType: 'REGISTER',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            success: false,
            details: { error: String(err) },
        });
        (0, response_js_1.errorResponse)(res, 'Failed to create account', 'INTERNAL_ERROR', 500);
    }
    finally {
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
router.post('/login', (0, validate_js_1.validate)(loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await (0, database_js_1.query)('SELECT id, email, password_hash, first_name, last_name, role, company_name, subscription_tier, subscription_status, avatar_url, phone FROM users WHERE email = $1', [email.toLowerCase()]);
        if (result.rows.length === 0) {
            await (0, audit_js_1.auditLog)({
                eventType: 'LOGIN',
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                success: false,
                details: { email: email.toLowerCase(), reason: 'user_not_found' },
            });
            return (0, response_js_1.errorResponse)(res, 'Invalid email or password', 'UNAUTHORIZED', 401);
        }
        const user = result.rows[0];
        const validPassword = await (0, password_js_1.comparePassword)(password, user.password_hash);
        if (!validPassword) {
            await (0, audit_js_1.auditLog)({
                eventType: 'LOGIN',
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                success: false,
                details: { email: user.email, reason: 'invalid_password' },
            });
            return (0, response_js_1.errorResponse)(res, 'Invalid email or password', 'UNAUTHORIZED', 401);
        }
        const payload = {
            userId: user.id,
            email: user.email,
            role: user.role,
        };
        const accessToken = (0, jwt_js_1.generateAccessToken)(payload);
        const refreshToken = (0, jwt_js_1.generateRefreshToken)(payload);
        const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const tokenHash = (0, jwt_js_1.hashRefreshToken)(refreshToken);
        await (0, database_js_1.query)('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)', [(0, uuid_1.v4)(), user.id, tokenHash, refreshExpiry]);
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
        await (0, audit_js_1.auditLog)({
            userId: user.id,
            eventType: 'LOGIN',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            success: true,
            details: { email: user.email },
        });
        (0, response_js_1.successResponse)(res, {
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
    }
    catch (err) {
        console.error('[Auth] Login error:', err);
        (0, response_js_1.errorResponse)(res, 'Login failed', 'INTERNAL_ERROR', 500);
    }
});
// ─── Refresh Token ──────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
        if (!refreshToken) {
            return (0, response_js_1.errorResponse)(res, 'Refresh token required', 'UNAUTHORIZED', 401);
        }
        const { verifyRefreshToken } = await import('../utils/jwt.js');
        let decoded;
        try {
            decoded = verifyRefreshToken(refreshToken);
        }
        catch {
            return (0, response_js_1.errorResponse)(res, 'Invalid refresh token', 'UNAUTHORIZED', 401);
        }
        // Check if refresh token exists in database (using hash)
        const tokenHash = (0, jwt_js_1.hashRefreshToken)(refreshToken);
        const tokenResult = await (0, database_js_1.query)('SELECT * FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()', [tokenHash, decoded.userId]);
        if (tokenResult.rows.length === 0) {
            return (0, response_js_1.errorResponse)(res, 'Invalid or expired refresh token', 'UNAUTHORIZED', 401);
        }
        // Generate new tokens
        const payload = { userId: decoded.userId, email: decoded.email, role: decoded.role };
        const newAccessToken = (0, jwt_js_1.generateAccessToken)(payload);
        const newRefreshToken = (0, jwt_js_1.generateRefreshToken)(payload);
        // Delete old token (using hash), insert new
        await (0, database_js_1.query)('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
        const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const newTokenHash = (0, jwt_js_1.hashRefreshToken)(newRefreshToken);
        await (0, database_js_1.query)('INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)', [(0, uuid_1.v4)(), decoded.userId, newTokenHash, newExpiry]);
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
        await (0, audit_js_1.auditLog)({
            userId: decoded.userId,
            eventType: 'REFRESH',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            success: true,
            details: { email: decoded.email },
        });
        (0, response_js_1.successResponse)(res, { accessToken: newAccessToken });
    }
    catch (err) {
        console.error('[Auth] Refresh error:', err);
        (0, response_js_1.errorResponse)(res, 'Token refresh failed', 'INTERNAL_ERROR', 500);
    }
});
// ─── Logout ──────────────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        let userId = null;
        if (refreshToken) {
            const tokenHash = (0, jwt_js_1.hashRefreshToken)(refreshToken);
            const result = await (0, database_js_1.query)('SELECT user_id FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
            if (result.rows.length > 0) {
                userId = result.rows[0].user_id;
            }
            await (0, database_js_1.query)('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
        }
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        if (userId) {
            await (0, redis_js_1.invalidateUserCache)(userId);
        }
        await (0, audit_js_1.auditLog)({
            userId: userId || undefined,
            eventType: 'LOGOUT',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            success: true,
        });
        (0, response_js_1.successResponse)(res, { message: 'Logged out successfully' });
    }
    catch (err) {
        console.error('[Auth] Logout error:', err);
        (0, response_js_1.errorResponse)(res, 'Logout failed', 'INTERNAL_ERROR', 500);
    }
});
// ─── Get Current User ───────────────────────────────────────────────────
router.get('/me', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const result = await (0, database_js_1.query)(`SELECT id, email, first_name, last_name, role, company_name, phone,
              subscription_tier, subscription_status, avatar_url, created_at
       FROM users WHERE id = $1`, [req.user.id]);
        if (result.rows.length === 0) {
            return (0, response_js_1.errorResponse)(res, 'User not found', 'NOT_FOUND', 404);
        }
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        console.error('[Auth] Get me error:', err);
        (0, response_js_1.errorResponse)(res, 'Failed to get user', 'INTERNAL_ERROR', 500);
    }
});
// ─── Update Profile ─────────────────────────────────────────────────────
router.put('/me', auth_js_1.authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, companyName, phone } = req.body;
        const userId = req.user.id;
        const updates = [];
        const values = [];
        let idx = 1;
        if (firstName !== undefined) {
            updates.push(`first_name = $${idx++}`);
            values.push(firstName);
        }
        if (lastName !== undefined) {
            updates.push(`last_name = $${idx++}`);
            values.push(lastName);
        }
        if (companyName !== undefined) {
            updates.push(`company_name = $${idx++}`);
            values.push(companyName);
        }
        if (phone !== undefined) {
            updates.push(`phone = $${idx++}`);
            values.push(phone);
        }
        if (updates.length === 0) {
            return (0, response_js_1.errorResponse)(res, 'No fields to update', 'VALIDATION_ERROR', 400);
        }
        values.push(userId);
        const sql = `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;
        const result = await (0, database_js_1.query)(sql, values);
        // Invalidate cache since profile changed
        await (0, redis_js_1.invalidateUserCache)(userId);
        (0, response_js_1.successResponse)(res, result.rows[0]);
    }
    catch (err) {
        console.error('[Auth] Update me error:', err);
        (0, response_js_1.errorResponse)(res, 'Failed to update profile', 'INTERNAL_ERROR', 500);
    }
});
// ─── Change Password ──────────────────────────────────────────────────────
router.post('/change-password', auth_js_1.authenticateToken, (0, validate_js_1.validate)(changePasswordSchema), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;
        const userResult = await (0, database_js_1.query)('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0) {
            return (0, response_js_1.errorResponse)(res, 'User not found', 'NOT_FOUND', 404);
        }
        const validCurrent = await (0, password_js_1.comparePassword)(currentPassword, userResult.rows[0].password_hash);
        if (!validCurrent) {
            await (0, audit_js_1.auditLog)({
                userId,
                eventType: 'CHANGE_PASSWORD',
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                success: false,
                details: { reason: 'invalid_current_password' },
            });
            return (0, response_js_1.errorResponse)(res, 'Current password is incorrect', 'UNAUTHORIZED', 401);
        }
        const pwCheck = (0, password_js_1.validatePassword)(newPassword);
        if (!pwCheck.valid) {
            return (0, response_js_1.errorResponse)(res, pwCheck.errors[0], 'VALIDATION_ERROR', 400, pwCheck.errors);
        }
        const newHash = await (0, password_js_1.hashPassword)(newPassword);
        await (0, database_js_1.query)('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
        // Revoke all refresh tokens
        await (0, database_js_1.query)('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
        await (0, redis_js_1.invalidateUserCache)(userId);
        await (0, audit_js_1.auditLog)({
            userId,
            eventType: 'CHANGE_PASSWORD',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            success: true,
        });
        (0, response_js_1.successResponse)(res, { message: 'Password changed successfully' });
    }
    catch (err) {
        console.error('[Auth] Change password error:', err);
        (0, response_js_1.errorResponse)(res, 'Failed to change password', 'INTERNAL_ERROR', 500);
    }
});
//# sourceMappingURL=auth.js.map