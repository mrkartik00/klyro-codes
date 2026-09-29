import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { Workspace } from '../../src/models/Workspace.js';
import { User } from '../../src/models/User.js';
import { Notification } from '../../src/models/Notification.js';
import { Conversation, ChatMessage } from '../../src/models/Conversation.js';
import {
  getOrCreatePortalConversation,
  postChatMessage,
  assertClientOwnsConversation,
} from '../../src/services/conversation.service.js';

describe('conversation.service (portal chat, D)', () => {
  let ws, alice, bob;
  beforeAll(async () => {
    ws = await Workspace.create({ name: 'Klyro', slug: 'klyro-convo' });
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Conversation.deleteMany({}), ChatMessage.deleteMany({}), Notification.deleteMany({})]);
    alice = await User.create({ name: 'Alice', email: 'a@x.com', passwordHash: 'x' });
    bob = await User.create({ name: 'Bob', email: 'b@x.com', passwordHash: 'x' });
  });

  it('creates one conversation per client and reuses it', async () => {
    const c1 = await getOrCreatePortalConversation({ workspaceId: ws._id, clientUserId: alice._id });
    const c2 = await getOrCreatePortalConversation({ workspaceId: ws._id, clientUserId: alice._id });
    expect(String(c1._id)).toBe(String(c2._id));
  });

  it('posts a message, updates preview, and notifies the client on admin reply', async () => {
    const convo = await getOrCreatePortalConversation({ workspaceId: ws._id, clientUserId: alice._id });
    await postChatMessage({ workspaceId: ws._id, conversationId: convo._id, senderId: alice._id, senderRole: 'client', body: 'Hi there' });
    const adminMsg = await postChatMessage({ workspaceId: ws._id, conversationId: convo._id, senderId: bob._id, senderRole: 'admin', body: 'Hello back' });
    expect(adminMsg.body).toBe('Hello back');
    const reloaded = await Conversation.findById(convo._id);
    expect(reloaded.lastPreview).toBe('Hello back');
    expect(await ChatMessage.countDocuments({ conversationId: convo._id })).toBe(2);
    // admin reply notifies the owning client
    expect(await Notification.countDocuments({ userId: alice._id, type: 'chat.message' })).toBe(1);
  });

  it('assertClientOwnsConversation blocks a non-owner (IDOR)', async () => {
    const convo = await getOrCreatePortalConversation({ workspaceId: ws._id, clientUserId: alice._id });
    await expect(
      assertClientOwnsConversation({ workspaceId: ws._id, conversationId: convo._id, clientUserId: bob._id }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      assertClientOwnsConversation({ workspaceId: ws._id, conversationId: convo._id, clientUserId: alice._id }),
    ).resolves.toBeTruthy();
  });
});
