import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/database.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/response.js';
import { sendPushToUser } from '../utils/push.js';

const router = Router();

const registerTokenSchema = z.object({
  pushToken: z.string().min(1, 'Push token is required'),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});

const testPushSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

/**
 * Register or update the user's push token.
 */
router.post('/register-token', authenticateToken, validate(registerTokenSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { pushToken, platform } = req.body;

    await query(
      `UPDATE users SET push_token = $1, push_platform = $2, updated_at = NOW()
       WHERE id = $3`,
      [pushToken, platform || null, userId]
    );

    successResponse(res, { message: 'Push token registered' });
  } catch (err) {
    console.error('[Push] Register token error:', err);
    errorResponse(res, 'Failed to register push token', 'INTERNAL_ERROR', 500);
  }
});

/**
 * Unregister the user's push token.
 */
router.post('/unregister-token', authenticateToken, async (req, res) => {
  try {
    const userId = req.user!.id;
    await query('UPDATE users SET push_token = NULL WHERE id = $1', [userId]);
    successResponse(res, { message: 'Push token unregistered' });
  } catch (err) {
    console.error('[Push] Unregister token error:', err);
    errorResponse(res, 'Failed to unregister push token', 'INTERNAL_ERROR', 500);
  }
});

/**
 * Send a test push notification to the current user.
 */
router.post('/test', authenticateToken, validate(testPushSchema), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { title, body } = req.body;

    const result = await sendPushToUser(userId, title, body, { test: true });
    successResponse(res, result);
  } catch (err) {
    console.error('[Push] Test error:', err);
    errorResponse(res, 'Failed to send test push', 'INTERNAL_ERROR', 500);
  }
});

export { router as pushRouter };
