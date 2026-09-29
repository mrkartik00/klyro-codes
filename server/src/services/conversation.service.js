import { Conversation, ChatMessage } from '../models/Conversation.js';
import { Notification } from '../models/Notification.js';
import { Project } from '../models/Project.js';
import { withTransaction } from '../utils/transaction.js';
import { ApiError } from '../utils/ApiError.js';

/** Get or create the portal conversation for a client (optionally per project). */
export async function getOrCreatePortalConversation({ workspaceId, clientUserId, projectId, createdBy }) {
  const filter = { workspaceId, kind: 'portal', clientUserId, projectId: projectId ?? null };
  let convo = await Conversation.findOne(filter);
  if (!convo) {
    convo = await Conversation.create({ ...filter, createdBy: createdBy ?? clientUserId, subject: 'Support' });
  }
  return convo;
}

/**
 * D30/D33 — post a chat message + update the conversation preview + notify the
 * other party, atomically. Returns the saved message.
 */
export async function postChatMessage({ workspaceId, conversationId, senderId, senderRole, body, attachments }) {
  return withTransaction(async (session) => {
    const convo = await Conversation.findOne({ workspaceId, _id: conversationId }).session(session);
    if (!convo) throw ApiError.notFound('Conversation not found');

    const [msg] = await ChatMessage.create(
      [{ workspaceId, conversationId, senderId, senderRole, body, attachments: attachments ?? [] }],
      { session, ordered: true },
    );

    convo.lastMessageAt = new Date();
    convo.lastPreview = body.slice(0, 140);
    await convo.save({ session });

    // Notify the recipient (client ← admin, or admin surfaces via workspace room).
    if (senderRole === 'admin' && convo.clientUserId) {
      await Notification.create(
        [{ workspaceId, userId: convo.clientUserId, type: 'chat.message', title: 'New message', body: body.slice(0, 140), data: { conversationId } }],
        { session, ordered: true },
      );
    }
    return msg;
  });
}

/** Verify a client owns a portal conversation (IDOR guard for the portal). */
export async function assertClientOwnsConversation({ workspaceId, conversationId, clientUserId }) {
  const convo = await Conversation.findOne({ workspaceId, _id: conversationId, clientUserId }).lean();
  if (!convo) throw ApiError.notFound('Conversation not found');
  return convo;
}

export { Conversation, ChatMessage, Project };
