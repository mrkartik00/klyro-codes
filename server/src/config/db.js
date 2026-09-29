import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

export async function connectDb(uri = env.MONGODB_URI) {
  // Already connected (e.g. dev-local launcher connected first) — reuse it.
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info('MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

/** Ping the database for the health check. */
export async function pingDb() {
  if (mongoose.connection.readyState !== 1) return false;
  await mongoose.connection.db.admin().ping();
  return true;
}

export { mongoose };
