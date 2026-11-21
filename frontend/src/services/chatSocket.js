import { io } from 'socket.io-client';
import { getAccessToken } from './apiClient.js';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const createChatSocket = () => {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Sign in before connecting to chat');
  }
  return io(SOCKET_URL, {
    auth: { token },
    autoConnect: true,
    reconnection: true,
    timeout: 5000,
    transports: ['websocket'],
  });
};

export const emitChatEvent = (socket, event, payload) =>
  new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (timeoutError, response) => {
      if (timeoutError) {
        reject(new Error('The chat server did not respond'));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error.message || 'The chat action failed'));
        return;
      }
      resolve(response?.data);
    });
  });
