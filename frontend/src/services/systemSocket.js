import { io } from 'socket.io-client';
import { getAccessToken } from './apiClient.js';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export function pingSocketServer() {
  const token = getAccessToken();
  if (!token) {
    return Promise.reject(new Error('Sign in before checking the realtime connection'));
  }

  const socket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: false,
    reconnection: false,
    timeout: 5000,
    transports: ['websocket'],
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      socket.disconnect();
      callback(value);
    };

    socket.once('connect_error', (error) => finish(reject, error));
    socket.once('connect', () => {
      socket.timeout(5000).emit('health:ping', { source: 'web-client' }, (error, response) => {
        if (error) {
          finish(reject, new Error('Socket.IO ping timed out'));
          return;
        }

        if (response?.event !== 'health:pong' || response.ok !== true) {
          finish(reject, new Error('Socket.IO returned an invalid ping response'));
          return;
        }

        finish(resolve, response);
      });
    });

    socket.connect();
  });
}
