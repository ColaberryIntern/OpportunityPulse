import { io } from 'socket.io-client';

let socket = null;

export function connectSocket() {
  if (socket?.connected) return socket;

  const token = localStorage.getItem('token');
  if (!token) return null;

  // Connect to the same origin (nginx proxies /socket.io/ to backend)
  socket = io({
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on('connect', () => {
    console.info('Socket connected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.warn('Socket connection error:', err.message);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
