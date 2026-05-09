"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUser = registerUser;
exports.loginUser = loginUser;
exports.refreshAccessToken = refreshAccessToken;
exports.logoutUser = logoutUser;
exports.changeUserPassword = changeUserPassword;
exports.getUserById = getUserById;
const uuid_1 = require("uuid");
const database_js_1 = require("../config/database.js");
const jwt_js_1 = require("../utils/jwt.js");
const password_js_1 = require("../utils/password.js");
async function registerUser(data) {
    const { email, password, firstName, lastName, companyName } = data;
    const existing = await (0, database_js_1.query)('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0)
        throw new Error('EMAIL_EXISTS');
    const passwordHash = await (0, password_js_1.hashPassword)(password);
    const userId = (0, uuid_1.v4)();
    await (0, database_js_1.query)(`INSERT INTO users (id, email, password_hash, first_name, last_name, company_name, subscription_tier, subscription_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [userId, email.toLowerCase(), passwordHash, firstName || null, lastName || null, companyName || null, 'free', 'inactive']);
    const payload = { userId, email: email.toLowerCase(), role: 'user' };
    const accessToken = (0, jwt_js_1.generateAccessToken)(payload);
    const refreshToken = (0, jwt_js_1.generateRefreshToken)(payload);
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await (0, database_js_1.query)('INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)', [(0, uuid_1.v4)(), userId, refreshToken, refreshExpiry]);
    const user = await (0, database_js_1.query)('SELECT id, email, first_name, last_name, role, company_name, subscription_tier, subscription_status, created_at FROM users WHERE id = $1', [userId]);
    return { user: user.rows[0], accessToken, refreshToken };
}
async function loginUser(email, password) {
    const result = await (0, database_js_1.query)('SELECT id, email, password_hash, first_name, last_name, role, company_name, subscription_tier, subscription_status, avatar_url, phone FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0)
        throw new Error('INVALID_CREDENTIALS');
    const user = result.rows[0];
    const valid = await (0, password_js_1.comparePassword)(password, user.password_hash);
    if (!valid)
        throw new Error('INVALID_CREDENTIALS');
    const payload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = (0, jwt_js_1.generateAccessToken)(payload);
    const refreshToken = (0, jwt_js_1.generateRefreshToken)(payload);
    const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await (0, database_js_1.query)('INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)', [(0, uuid_1.v4)(), user.id, refreshToken, refreshExpiry]);
    return {
        user: {
            id: user.id, email: user.email,
            firstName: user.first_name, lastName: user.last_name,
            role: user.role, companyName: user.company_name,
            subscriptionTier: user.subscription_tier,
            subscriptionStatus: user.subscription_status,
            avatarUrl: user.avatar_url, phone: user.phone,
        },
        accessToken,
        refreshToken,
    };
}
async function refreshAccessToken(refreshToken) {
    const { verifyRefreshToken } = await import('../utils/jwt.js');
    const decoded = verifyRefreshToken(refreshToken);
    const tokenResult = await (0, database_js_1.query)('SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()', [refreshToken, decoded.userId]);
    if (tokenResult.rows.length === 0)
        throw new Error('INVALID_REFRESH_TOKEN');
    const payload = { userId: decoded.userId, email: decoded.email, role: decoded.role };
    const newAccessToken = (0, jwt_js_1.generateAccessToken)(payload);
    const newRefreshToken = (0, jwt_js_1.generateRefreshToken)(payload);
    await (0, database_js_1.query)('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await (0, database_js_1.query)('INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)', [(0, uuid_1.v4)(), decoded.userId, newRefreshToken, newExpiry]);
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}
async function logoutUser(refreshToken) {
    if (refreshToken) {
        await (0, database_js_1.query)('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    }
}
async function changeUserPassword(userId, currentPassword, newPassword) {
    const userResult = await (0, database_js_1.query)('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0)
        throw new Error('USER_NOT_FOUND');
    const validCurrent = await (0, password_js_1.comparePassword)(currentPassword, userResult.rows[0].password_hash);
    if (!validCurrent)
        throw new Error('INVALID_CURRENT_PASSWORD');
    const newHash = await (0, password_js_1.hashPassword)(newPassword);
    await (0, database_js_1.query)('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
    await (0, database_js_1.query)('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}
async function getUserById(userId) {
    const result = await (0, database_js_1.query)(`SELECT id, email, first_name, last_name, role, company_name, phone,
     subscription_tier, subscription_status, avatar_url, created_at
     FROM users WHERE id = $1`, [userId]);
    if (result.rows.length === 0)
        throw new Error('USER_NOT_FOUND');
    return result.rows[0];
}
//# sourceMappingURL=authService.js.map