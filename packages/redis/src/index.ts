import Redis from 'ioredis';

export function createRedisClient(url = process.env.REDIS_URL) {
  if (!url) return null;
  return new Redis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true });
}

export async function withRedisLock<T>(redis: Redis, key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') throw new Error(`REDIS_LOCK_BUSY:${key}`);
  try { return await fn(); }
  finally {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, token);
  }
}
