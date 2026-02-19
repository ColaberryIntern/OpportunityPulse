const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { env } = require('./environment');
const logger = require('../logging/logger');

let io = null;

function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.frontendUrl || 'http://localhost:3002',
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // JWT auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, env.jwt.secret);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.userId;
    socket.join(`user:${userId}`);
    logger.info(`Socket connected: user ${userId}, socket ${socket.id}`);

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: user ${userId}, reason: ${reason}`);
    });
  });

  logger.info('Socket.IO initialized');
  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

module.exports = { initializeSocket, getIO };
