import { useEffect, useRef, useCallback, useState } from 'react';
import { connectSocket, getSocket } from '../services/socketService';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const sock = connectSocket();
    socketRef.current = sock;

    if (sock) {
      const handleConnect = () => setConnected(true);
      const handleDisconnect = () => setConnected(false);

      sock.on('connect', handleConnect);
      sock.on('disconnect', handleDisconnect);

      // Set initial state
      setConnected(sock.connected);

      return () => {
        sock.off('connect', handleConnect);
        sock.off('disconnect', handleDisconnect);
      };
    }
  }, []);

  const on = useCallback((event, handler) => {
    const sock = getSocket();
    if (sock) {
      sock.on(event, handler);
    }
    return () => {
      const s = getSocket();
      if (s) s.off(event, handler);
    };
  }, []);

  return { socket: socketRef.current, on, connected };
}
