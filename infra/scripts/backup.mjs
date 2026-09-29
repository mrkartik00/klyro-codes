#!/usr/bin/env node
/**
 * Node-based nightly backup (no apt tools needed): dumps every MongoDB
 * collection to newline-delimited JSON, gzips it, and uploads to DO Spaces
 * using the AWS SDK already bundled with the server.
 *
 * Run:  node --env-file=server/.env infra/scripts/backup.mjs
 * Cron: 0 3 * * *  cd /var/www/klyro && node --env-file=server/.env infra/scripts/backup.mjs >> /var/log/klyro/backup.log 2>&1
 *
 * Requires in server/.env: MONGODB_URI, DO_SPACES_* (incl ACCESS/SECRET keys).
 */
import zlib from 'node:zlib';
import { MongoClient } from 'mongodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const {
  MONGODB_URI,
  DO_SPACES_ENDPOINT,
  DO_SPACES_REGION,
  DO_SPACES_BUCKET,
  DO_SPACES_ACCESS_KEY,
  DO_SPACES_SECRET_KEY,
  DO_SPACES_PREFIX = 'klyro',
} = process.env;

if (!MONGODB_URI) throw new Error('MONGODB_URI required');
if (!DO_SPACES_ACCESS_KEY || !DO_SPACES_SECRET_KEY) throw new Error('DO Spaces keys required');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');

const s3 = new S3Client({
  endpoint: DO_SPACES_ENDPOINT,
  region: DO_SPACES_REGION,
  credentials: { accessKeyId: DO_SPACES_ACCESS_KEY, secretAccessKey: DO_SPACES_SECRET_KEY },
});

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db();
const collections = await db.listCollections().toArray();

const chunks = [];
for (const { name } of collections) {
  const docs = await db.collection(name).find({}).toArray();
  for (const d of docs) chunks.push(JSON.stringify({ __collection: name, ...d }));
}
const body = zlib.gzipSync(Buffer.from(chunks.join('\n'), 'utf8'));
const key = `${DO_SPACES_PREFIX}/backups/mongo-${stamp}.ndjson.gz`;

await s3.send(
  new PutObjectCommand({ Bucket: DO_SPACES_BUCKET, Key: key, Body: body, ContentType: 'application/gzip' }),
);
await client.close();

console.log(`[backup] uploaded ${key} (${collections.length} collections, ${(body.length / 1024).toFixed(1)} KB)`);
