import { v4 as uuidv4 } from 'uuid';
import { query, pool } from '../config/database.js';
import { generateAccessToken, generateRefreshToken, hashRefreshToken } from '../utils/jwt.js';
import { hashPassword, comparePassword } from '../utils/password.js';

export interface AuthResult {
  user: any;
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(data: {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
}): Promise<AuthResult> {
  const { email, password, firstName, lastName, companyName } = data;
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) throw new Error('EMAIL_EXISTS');

  const passwordHash = await hashPassword(password);
  const userId = uuidv4();

  await query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, company_name, subscription_tier, subscription_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, email.toLowerCase(), passwordHash, firstName || null, lastName || null, companyName || null, 'free', 'inactive']
  );

  const payload = { userId, email: email.toLowerCase(), role: 'user' };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const tokenHash = hashRefreshToken(refreshToken);
  await query(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [uuidv4(), userId, tokenHash, refreshExpiry]
  );

  const user = await query(
    'SELECT id, email, first_name, last_name, role, company_name, subscription_tier, subscription_status, created_at FROM users WHERE id = $1',
    [userId]
  );

  return { user: user.rows[0], accessToken, refreshToken };
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const result = await query(
    'SELECT id, email, password_hash, first_name, last_name, role, company_name, subscription_tier, subscription_status, avatar_url, phone FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) throw new Error('INVALID_CREDENTIALS');

  const user = result.rows[0];
  const valid = await comparePassword(password, user.password_hash);
  if (!valid) throw new Error('INVALID_CREDENTIALS');

  const payload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const tokenHash = hashRefreshToken(refreshToken);
  await query(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [uuidv4(), user.id, tokenHash, refreshExpiry]
  );

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

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const { verifyRefreshToken } = await import('../utils/jwt.js');
  const decoded = verifyRefreshToken(refreshToken);

  const tokenHash = hashRefreshToken(refreshToken);
  const tokenResult = await query(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND user_id = $2 AND expires_at > NOW()',
    [tokenHash, decoded.userId]
  );

  if (tokenResult.rows.length === 0) throw new Error('INVALID_REFRESH_TOKEN');

  const payload = { userId: decoded.userId, email: decoded.email, role: decoded.role };
  const newAccessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

  await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const newTokenHash = hashRefreshToken(newRefreshToken);
  await query(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [uuidv4(), decoded.userId, newTokenHash, newExpiry]
  );

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logoutUser(refreshToken?: string): Promise<void> {
  if (refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);
    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  }
}

export async function changeUserPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length === 0) throw new Error('USER_NOT_FOUND');

  const validCurrent = await comparePassword(currentPassword, userResult.rows[0].password_hash);
  if (!validCurrent) throw new Error('INVALID_CURRENT_PASSWORD');

  const newHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

export async function getUserById(userId: string) {
  const result = await query(
    `SELECT id, email, first_name, last_name, role, company_name, phone,
     subscription_tier, subscription_status, avatar_url, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (result.rows.length === 0) throw new Error('USER_NOT_FOUND');
  return result.rows[0];
}
