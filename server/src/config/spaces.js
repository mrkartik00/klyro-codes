import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env.js';
import { logger } from './logger.js';

let client = null;

export function getSpaces() {
  if (client) return client;
  if (!env.DO_SPACES_ACCESS_KEY || !env.DO_SPACES_SECRET_KEY) {
    logger.warn('DO Spaces credentials not set; file uploads will fail');
    return null;
  }
  client = new S3Client({
    endpoint: env.DO_SPACES_ENDPOINT,
    region: env.DO_SPACES_REGION,
    forcePathStyle: false,
    credentials: {
      accessKeyId: env.DO_SPACES_ACCESS_KEY,
      secretAccessKey: env.DO_SPACES_SECRET_KEY,
    },
  });
  return client;
}

export const bucket = env.DO_SPACES_BUCKET;
export const keyFor = (path) => `${env.DO_SPACES_PREFIX}/${path.replace(/^\/+/, '')}`;

export async function presignUpload(path, contentType, expiresIn = 900) {
  const s3 = getSpaces();
  if (!s3) throw new Error('Storage not configured');
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: keyFor(path), ContentType: contentType }),
    { expiresIn },
  );
}

export async function presignDownload(path, expiresIn = 900) {
  const s3 = getSpaces();
  if (!s3) throw new Error('Storage not configured');
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: keyFor(path) }), {
    expiresIn,
  });
}

export async function objectExists(path) {
  const s3 = getSpaces();
  if (!s3) return false;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: keyFor(path) }));
    return true;
  } catch {
    return false;
  }
}

export async function removeObject(path) {
  const s3 = getSpaces();
  if (!s3) return;
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: keyFor(path) }));
}
