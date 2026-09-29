import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env, corsOrigins } from '../config/env.js';
import { logger } from '../config/logger.js';

let io = null;

/** Attach Socket.IO to the HTTP server. JWT handshake; workspace + user rooms. */
export function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: corsOrigins, credentials: true } });

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
    socket.join(`ws:${socket.data.workspaceId}`);
    socket.join(`user:${socket.data.userId}`);
    socket.on('conversation:join', (conversationId) => socket.join(`conv:${conversationId}`));
    socket.on('conversation:leave', (conversationId) => socket.leave(`conv:${conversationId}`));
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
