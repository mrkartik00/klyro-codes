import { io } from 'socket.io-client';
import { API_URL, getToken } from './api.js';

// Socket connects to the API origin (strip the /api/v1 path).
function socketOrigin() {
  try {
    const url = new URL(API_URL);
    return url.origin;
  } catch {
    return 'http://localhost:4100';
  }
}

export function createSocket() {
  const token = getToken();
  return io(socketOrigin(), {
    auth: { token },
    autoConnect: true,
    reconnectionAttempts: 3,
    transports: ['websocket', 'polling'],
  });
}
