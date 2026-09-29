import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { env, corsOrigins } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getRedis } from '../config/redis.js';
import { postChatMessage, assertClientOwnsConversation } from '../services/conversation.service.js';

let io = null;

/** Attach Socket.IO to the HTTP server. JWT handshake; workspace + user rooms. */
export function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: corsOrigins, credentials: true } });

  // D32 — Redis adapter so events reach clients on any PM2 instance.
  try {
    const pub = getRedis();
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    logger.info('Socket.IO Redis adapter attached');
  } catch (err) {
    logger.warn({ err }, 'Socket.IO Redis adapter unavailable; single-instance only');
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
      socket.data.userId = payload.sub;
      socket.data.workspaceId = payload.workspaceId;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, workspaceId, role } = socket.data;
    socket.join(`ws:${workspaceId}`);
    socket.join(`user:${userId}`);

    // D30 — portal chat. The client emits `join` with a conversation room and
    // `message` with { room, body }. Persist + broadcast to the room.
    socket.on('join', async ({ room } = {}) => {
      if (!room) return;
      // Clients may only join conversations they own; admins may join any.
      if (role === 'client') {
        try {
          await assertClientOwnsConversation({ workspaceId, conversationId: room, clientUserId: userId });
        } catch {
          return;
        }
      }
      socket.join(`conv:${room}`);
    });
    socket.on('leave', ({ room } = {}) => room && socket.leave(`conv:${room}`));
    // Back-compat aliases used elsewhere.
    socket.on('conversation:join', (id) => id && socket.join(`conv:${id}`));
    socket.on('conversation:leave', (id) => id && socket.leave(`conv:${id}`));

    socket.on('message', async ({ room, body } = {}) => {
      if (!room || !body?.trim()) return;
      try {
        if (role === 'client') {
          await assertClientOwnsConversation({ workspaceId, conversationId: room, clientUserId: userId });
        }
        const msg = await postChatMessage({
          workspaceId,
          conversationId: room,
          senderId: userId,
          senderRole: role === 'client' ? 'client' : 'admin',
          body: body.trim(),
        });
        const payload = { id: msg._id, conversationId: room, senderId: userId, senderRole: msg.senderRole, body: msg.body, createdAt: msg.createdAt };
        io.to(`conv:${room}`).emit('chat:message', payload);
        io.to(`ws:${workspaceId}`).emit('chat:message', payload); // admins watching the inbox
      } catch (err) {
        logger.warn({ err }, 'chat message rejected');
        socket.emit('error', { message: 'message failed' });
      }
    });
  });

  logger.info('Socket.IO initialised');
  return io;
}

export function getIo() {
  return io;
}

// Emit helpers (no-op if sockets not initialised, e.g. in tests).
export function emitToWorkspace(workspaceId, event, payload) {
  io?.to(`ws:${workspaceId}`).emit(event, payload);
}
export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}
export function emitToConversation(conversationId, event, payload) {
  io?.to(`conv:${conversationId}`).emit(event, payload);
}
