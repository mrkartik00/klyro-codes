import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import {
  presignFileUpload,
  completeFileUpload,
  getFileDownload,
  deleteFile,
} from '../services/file.service.js';

export const filesRouter = Router();

// POST /files/presign — validate type/size, create a pending record, return a PUT URL.
filesRouter.post(
  '/presign',
  validateBody(
    z.object({
      name: z.string().min(1).max(255),
      mime: z.string().min(1),
      size: z.number().int().positive(),
      visibility: z.enum(['private', 'public']).default('private'),
      projectId: z.string().optional(),
      conversationId: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) =>
    created(
      res,
      await presignFileUpload({
        workspaceId: req.workspaceId,
        actorId: req.auth.userId,
        ...req.body,
      }),
    ),
  ),
);

// POST /files/:id/complete — confirm the object exists in storage, mark ready.
filesRouter.post(
  '/:id/complete',
  asyncHandler(async (req, res) =>
    ok(
      res,
      await completeFileUpload({
        workspaceId: req.workspaceId,
        fileId: req.params.id,
        actorId: req.auth.userId,
      }),
    ),
  ),
);

// GET /files/:id/download — signed URL (private) or public URL.
filesRouter.get(
  '/:id/download',
  asyncHandler(async (req, res) =>
    ok(res, await getFileDownload({ workspaceId: req.workspaceId, fileId: req.params.id })),
  ),
);

// DELETE /files/:id — soft delete + remove from storage.
filesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) =>
    ok(res, await deleteFile({ workspaceId: req.workspaceId, fileId: req.params.id, actorId: req.auth.userId })),
  ),
);
