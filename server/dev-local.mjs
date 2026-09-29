/**
 * Local dev launcher — zero external services.
 * Spins up an in-memory replica-set MongoDB (transactions work) and an
 * in-memory Redis, seeds the admin user, then starts the API on :4100.
 *
 * Usage: npm run dev:local  (from repo root, in server/)
 * Ctrl-C to stop; the in-memory stores are discarded on exit.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
let RedisMemoryServer;
try { ({ RedisMemoryServer } = await import('redis-memory-server')); } catch { console.error('redis-memory-server (optional) not installed — run: npm i -D redis-memory-server -w server'); process.exit(1); }

const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const redis = new RedisMemoryServer();
const redisHost = await redis.getHost();
const redisPort = await redis.getPort();

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PORT = process.env.PORT || '4100';
process.env.MONGODB_URI = mongo.getUri('klyro');
process.env.REDIS_URL = `redis://${redisHost}:${redisPort}/3`;
process.env.JWT_ACCESS_SECRET ||= 'dev-access-secret-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET ||= 'dev-refresh-secret-at-least-32-chars-long';
process.env.ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.INTERNAL_HMAC_SECRET ||= 'dev-internal-hmac-secret';

console.log('▶ In-memory Mongo:', process.env.MONGODB_URI);
console.log('▶ In-memory Redis:', process.env.REDIS_URL);

// Seed the admin before boot so you can log in immediately.
const { connectDb } = await import('./src/config/db.js');
await connectDb();
const { Workspace } = await import('./src/models/Workspace.js');
const { User } = await import('./src/models/User.js');
const { Membership } = await import('./src/models/Membership.js');
const { hashPassword } = await import('./src/services/auth.service.js');

const ws = await Workspace.create({ name: 'Klyro', slug: 'klyro' });
const user = await User.create({
  name: 'Kartik',
  email: 'kartik@klyro.codes',
  passwordHash: await hashPassword('DevPassword!2026'),
  emailVerifiedAt: new Date(),
});
await Membership.create({ workspaceId: ws._id, userId: user._id, role: 'super_admin' });
console.log('▶ Admin seeded: kartik@klyro.codes / DevPassword!2026 (workspace: klyro)');

// Start the API (its own connectDb call is a no-op since we're connected).
await import('./src/server.js');

const shutdown = async () => {
  await mongo.stop();
  await redis.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
