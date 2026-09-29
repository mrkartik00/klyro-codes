import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';

// Mock the Spaces layer so tests never touch real object storage. The service
// only cares that presign returns a URL and objectExists reflects reality.
const state = { uploaded: new Set() };
vi.mock('../../src/config/spaces.js', () => ({
  presignUpload: vi.fn(async (key) => `https://spaces.test/put/${key}`),
  presignDownload: vi.fn(async (key) => `https://spaces.test/get/${key}`),
  objectExists: vi.fn(async (key) => state.uploaded.has(key)),
  removeObject: vi.fn(async (key) => state.uploaded.delete(key)),
}));

const { Workspace } = await import('../../src/models/Workspace.js');
const { File } = await import('../../src/models/Notification.js');
const { AuditLog } = await import('../../src/models/AuditLog.js');
const {
  presignFileUpload,
  completeFileUpload,
  getFileDownload,
  deleteFile,
  MAX_FILE_BYTES,
} = await import('../../src/services/file.service.js');

describe('file.service (T7 uploads, ACID)', () => {
  let ws;
  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-files' });
  });
  beforeEach(async () => {
    state.uploaded.clear();
    await Promise.all([File.deleteMany({}), AuditLog.deleteMany({})]);
  });

  it('rejects a disallowed MIME type', async () => {
    await expect(
      presignFileUpload({ workspaceId: ws._id, name: 'x.exe', mime: 'application/x-msdownload', size: 10 }),
    ).rejects.toMatchObject({ statusCode: 415 });
    expect(await File.countDocuments()).toBe(0);
  });

  it('rejects a file over the size limit', async () => {
    await expect(
      presignFileUpload({ workspaceId: ws._id, name: 'big.pdf', mime: 'application/pdf', size: MAX_FILE_BYTES + 1 }),
    ).rejects.toMatchObject({ statusCode: 413 });
    expect(await File.countDocuments()).toBe(0);
  });

  it('presign creates a pending record + audit and returns a PUT url', async () => {
    const res = await presignFileUpload({
      workspaceId: ws._id,
      name: 'brief.pdf',
      mime: 'application/pdf',
      size: 2048,
      actorId: undefined,
    });
    expect(res.uploadUrl).toContain('https://spaces.test/put/');
    const file = await File.findById(res.fileId);
    expect(file.status).toBe('pending');
    expect(file.key).toMatch(/^private\//);
    expect(await AuditLog.countDocuments({ action: 'file.presign' })).toBe(1);
  });

  it('complete refuses when the object is not in storage', async () => {
    const { fileId } = await presignFileUpload({
      workspaceId: ws._id,
      name: 'a.png',
      mime: 'image/png',
      size: 100,
    });
    await expect(completeFileUpload({ workspaceId: ws._id, fileId })).rejects.toMatchObject({ statusCode: 409 });
    expect((await File.findById(fileId)).status).toBe('pending');
  });

  it('complete flips to ready once uploaded, and is idempotent', async () => {
    const { fileId, key } = await presignFileUpload({
      workspaceId: ws._id,
      name: 'a.png',
      mime: 'image/png',
      size: 100,
    });
    state.uploaded.add(key); // simulate the client PUT succeeding
    const done = await completeFileUpload({ workspaceId: ws._id, fileId });
    expect(done.status).toBe('ready');
    // second call is a no-op, not an error
    const again = await completeFileUpload({ workspaceId: ws._id, fileId });
    expect(again.status).toBe('ready');
    expect(await AuditLog.countDocuments({ action: 'file.complete' })).toBe(1);
  });

  it('download returns a signed url for a ready file and refuses a pending one', async () => {
    const { fileId, key } = await presignFileUpload({
      workspaceId: ws._id,
      name: 'a.png',
      mime: 'image/png',
      size: 100,
      visibility: 'private',
    });
    await expect(getFileDownload({ workspaceId: ws._id, fileId })).rejects.toMatchObject({ statusCode: 409 });
    state.uploaded.add(key);
    await completeFileUpload({ workspaceId: ws._id, fileId });
    const dl = await getFileDownload({ workspaceId: ws._id, fileId });
    expect(dl.url).toContain('https://spaces.test/get/');
  });

  it('delete soft-deletes the record and removes the object', async () => {
    const { fileId, key } = await presignFileUpload({
      workspaceId: ws._id,
      name: 'a.png',
      mime: 'image/png',
      size: 100,
    });
    state.uploaded.add(key);
    await completeFileUpload({ workspaceId: ws._id, fileId });
    await deleteFile({ workspaceId: ws._id, fileId });
    expect((await File.findById(fileId)).deletedAt).toBeTruthy();
    expect(state.uploaded.has(key)).toBe(false);
  });
});
