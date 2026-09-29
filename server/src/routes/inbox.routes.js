import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { validateBody } from '../middleware/validate.js';
import { listScoped } from '../utils/query.js';
import { Conversation, ChatMessage } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { postChatMessage } from '../services/conversation.service.js';
import { ApiError } from '../utils/ApiError.js';

// Admin unified inbox: email threads (Message) + portal conversations.
export const inboxRouter = Router();

inboxRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.kind) filter.kind = req.query.kind;
    const result = await listScoped(Conversation, {
      workspaceId: req.workspaceId,
      query: req.query,
      filter,
      sort: { lastMessageAt: -1 },
    });
    return ok(res, result.items, result.meta);
  }),
);

inboxRouter.get(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const convo = await Conversation.findOne({ workspaceId: req.workspaceId, _id: req.params.id });
    if (!convo) throw ApiError.notFound('Conversation not found');
    const messages =
      convo.kind === 'portal'
        ? await ChatMessage.find({ workspaceId: req.workspaceId, conversationId: convo._id }).sort({ createdAt: 1 }).lean()
        : await Message.find({ workspaceId: req.workspaceId, threadId: convo.threadId }).sort({ createdAt: 1 }).lean();
    return ok(res, { conversation: convo, messages });
  }),
);

// Admin posts a portal chat reply.
inboxRouter.post(
  '/conversations/:id/messages',
  validateBody(z.object({ body: z.string().min(1).max(5000) })),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await postChatMessage({
        workspaceId: req.workspaceId,
        conversationId: req.params.id,
        senderId: req.auth.userId,
        senderRole: 'admin',
        body: req.body.body,
      }),
    ),
  ),
);

export { inboxRouter as default };
