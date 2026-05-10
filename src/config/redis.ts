import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const redis = new Redis(REDIS_URL, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Error:', err.message));

export async function getCachedUser(userId: string) {
  const data = await redis.get(`user:${userId}`);
  return data ? JSON.parse(data) : null;
}

export async function setCachedUser(userId: string, user: any, ttl = 300) {
  await redis.setex(`user:${userId}`, ttl, JSON.stringify(user));
}

export async function invalidateUserCache(userId: string) {
  await redis.del(`user:${userId}`);
}
