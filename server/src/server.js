import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb, disconnectDb } from './config/db.js';
import { getRedis, closeRedis } from './config/redis.js';
import { initSocket } from './socket/index.js';
import { startQueues, stopQueues } from './queues/index.js';
import { loadSecrets, startSecretsRefresh, onSecretsChange } from './config/secrets.js';
import { resetGemini } from './integrations/gemini/index.js';

async function main() {
  await connectDb();
  getRedis();
  // API keys edited in the admin override .env; refreshed every 30 s.
  await loadSecrets().catch((err) => logger.error({ err }, 'could not load stored API keys'));
  startSecretsRefresh();
  onSecretsChange((names) => names.some((n) => n.startsWith('GEMINI')) && resetGemini());

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);
  startQueues();

  server.listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      // Workers first (they still write to Redis/Mongo), then the connections.
      await stopQueues().catch(() => {});
      await Promise.allSettled([disconnectDb(), closeRedis()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
