import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

let client = null;

export function getRedis() {
  if (client) return client;
  client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  client.on('error', (err) => logger.error({ err }, 'Redis error'));
  return client;
}

export async function pingRedis() {
  const c = getRedis();
  if (c.status === 'wait' || c.status === 'end') await c.connect();
  return (await c.ping()) === 'PONG';
}

export async function closeRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}
