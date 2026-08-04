import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../middleware/logger.js';

let io = null;

export function initSocket(httpServer, allowedOrigins) {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  // Same auth model as the REST API — a valid JWT is required to subscribe.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Socket connected');
    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Socket disconnected');
    });
  });

  return io;
}

// Broadcasts a change notification to every connected terminal. `resource`
// identifies what changed (order/table/inventory/menu/category); clients
// simply refetch their own data for any resource they care about instead of
// trying to patch state from the event payload.
export function emitChange(resource, extra = {}) {
  if (!io) return;
  io.emit('pos:update', { resource, ...extra, at: Date.now() });
}
