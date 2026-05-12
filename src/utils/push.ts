/**
 * Server-side push notification delivery via Expo Push Service.
 * Sends notifications to devices using stored Expo push tokens.
 */

import { query } from '../config/database.js';

interface PushPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to a single user.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ success: boolean; sent: number; failed: number }> {
  try {
    const result = await query(
      'SELECT push_token, push_platform FROM users WHERE id = $1 AND push_token IS NOT NULL',
      [userId]
    );

    if (result.rows.length === 0) {
      return { success: false, sent: 0, failed: 0 };
    }

    const tokens = result.rows.map((r: any) => r.push_token).filter(Boolean);
    return await sendExpoPush(tokens, title, body, data);
  } catch (err) {
    console.error('[Push] sendPushToUser error:', err);
    return { success: false, sent: 0, failed: 0 };
  }
}

/**
 * Send push to multiple users at once.
 */
export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ success: boolean; sent: number; failed: number }> {
  if (userIds.length === 0) return { success: true, sent: 0, failed: 0 };

  try {
    const result = await query(
      `SELECT DISTINCT push_token FROM users
       WHERE id = ANY($1) AND push_token IS NOT NULL`,
      [userIds]
    );

    const tokens = result.rows.map((r: any) => r.push_token).filter(Boolean);
    return await sendExpoPush(tokens, title, body, data);
  } catch (err) {
    console.error('[Push] sendPushToUsers error:', err);
    return { success: false, sent: 0, failed: 0 };
  }
}

async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ success: boolean; sent: number; failed: number }> {
  if (tokens.length === 0) return { success: true, sent: 0, failed: 0 };

  // Expo allows max 100 messages per request
  const chunks = chunkArray(tokens, 100);
  let sent = 0;
  let failed = 0;

  for (const chunk of chunks) {
    const messages: PushPayload[] = chunk.map((token) => ({
      to: token,
      title,
      body,
      data,
      sound: 'default',
      priority: 'high',
    }));

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      });

      const result = await response.json();
      if (result.data) {
        for (const receipt of result.data) {
          if (receipt.status === 'ok') {
            sent++;
          } else {
            failed++;
            if (receipt.details?.error === 'DeviceNotRegistered') {
              // Clean up invalid token
              await invalidateToken(chunk[receipt.data?.id] || receipt.to);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Push] Expo batch error:', err);
      failed += chunk.length;
    }
  }

  return { success: failed === 0, sent, failed };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function invalidateToken(token: string): Promise<void> {
  try {
    await query('UPDATE users SET push_token = NULL WHERE push_token = $1', [token]);
  } catch (e) {
    // best effort
  }
}
