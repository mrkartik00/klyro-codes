import crypto from 'node:crypto';
import { File } from '../models/Notification.js';
import { presignUpload, presignDownload, objectExists, removeObject } from '../config/spaces.js';
import { withTransaction } from '../utils/transaction.js';
import { writeAudit } from './audit.service.js';
import { ApiError } from '../utils/ApiError.js';

// What clients may upload. Kept deliberately small: documents and images only.
export const ALLOWED_MIME = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['application/pdf', 'pdf'],
  ['text/plain', 'txt'],
  ['text/csv', 'csv'],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'docx',
  ],
]);

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

// Build the object key: private files live under private/<workspace>/, public
// assets under public/<workspace>/. The random id keeps keys unguessable.
function buildKey({ workspaceId, visibility, ext }) {
  const scope = visibility === 'public' ? 'public' : 'private';
  const rand = crypto.randomBytes(12).toString('hex');
  return `${scope}/${workspaceId}/${rand}.${ext}`;
}

/**
 * Step 1 — presign. Validate the requested MIME and size, create a `pending`
 * File record, and hand back a short-lived PUT URL. The record is transactional
 * with its audit entry so we never leave an orphan audit or vice versa.
 */
export async function presignFileUpload({
  workspaceId,
  name,
  mime,
  size,
  visibility = 'private',
  ownerId,
  projectId,
  conversationId,
  actorId,
}) {
  const ext = ALLOWED_MIME.get(mime);
  if (!ext) throw new ApiError(415, `Unsupported file type: ${mime}`, { code: 'BAD_MIME' });
  if (!Number.isInteger(size) || size <= 0 || size > MAX_FILE_BYTES) {
    throw new ApiError(413, `File too large (max ${MAX_FILE_BYTES} bytes)`, { code: 'TOO_LARGE' });
  }

  const key = buildKey({ workspaceId, visibility, ext });

  const file = await withTransaction(async (session) => {
    const [doc] = await File.create(
      [
        {
          workspaceId,
          createdBy: actorId,
          ownerId: ownerId ?? actorId,
          projectId,
          conversationId,
          key,
          name,
          mime,
          size,
          visibility,
          status: 'pending',
        },
      ],
      { session, ordered: true },
    );
    await writeAudit(
      {
        workspaceId,
        actorId,
        action: 'file.presign',
        entity: 'file',
        entityId: doc._id,
        meta: { key, mime, size, visibility },
      },
      session,
    );
    return doc;
  });

  const uploadUrl = await presignUpload(key, mime);
  return { fileId: file._id, key, uploadUrl, expiresIn: 900 };
}

/**
 * Step 2 — complete. Verify the object actually landed in Spaces, then flip the
 * record to `ready`. Refuses to complete a file that isn't present so we never
 * expose a dangling reference.
 */
export async function completeFileUpload({ workspaceId, fileId, actorId }) {
  return withTransaction(async (session) => {
    const file = await File.findOne({ workspaceId, _id: fileId }).session(session);
    if (!file) throw ApiError.notFound('File not found');
    if (file.status === 'ready') return file; // idempotent

    const exists = await objectExists(file.key);
    if (!exists) throw new ApiError(409, 'Upload not found in storage', { code: 'NOT_UPLOADED' });

    file.status = 'ready';
    await file.save({ session });
    await writeAudit(
      {
        workspaceId,
        actorId,
        action: 'file.complete',
        entity: 'file',
        entityId: file._id,
        meta: { key: file.key },
      },
      session,
    );
    return file;
  });
}

/**
 * Return a link to download a file. Public files use the CDN/public URL;
 * private files get a short-lived signed URL so they're never world-readable.
 */
export async function getFileDownload({ workspaceId, fileId }) {
  const file = await File.findOne({ workspaceId, _id: fileId, deletedAt: null });
  if (!file) throw ApiError.notFound('File not found');
  if (file.status !== 'ready') throw new ApiError(409, 'File not ready', { code: 'NOT_READY' });
  const url = await presignDownload(file.key);
  return { url, name: file.name, mime: file.mime, size: file.size, expiresIn: 900 };
}

/** Soft-delete the record and best-effort remove the object from Spaces. */
export async function deleteFile({ workspaceId, fileId, actorId }) {
  const file = await withTransaction(async (session) => {
    const doc = await File.findOne({ workspaceId, _id: fileId }).session(session);
    if (!doc) throw ApiError.notFound('File not found');
    doc.deletedAt = new Date();
    await doc.save({ session });
    await writeAudit(
      { workspaceId, actorId, action: 'file.delete', entity: 'file', entityId: doc._id, meta: { key: doc.key } },
      session,
    );
    return doc;
  });
  await removeObject(file.key); // outside the txn: storage isn't transactional
  return { deleted: true };
}
