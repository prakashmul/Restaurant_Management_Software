import { io, type Socket } from 'socket.io-client';
import { API_ROOT } from '../api/posApi';

let socket: Socket | null = null;

// Singleton connection, lazily created on first use. The auth token is
// re-read from storage on every (re)connect attempt, so logging in after
// the socket module has loaded still authenticates correctly.
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_ROOT, {
      autoConnect: false,
      auth: (cb) => cb({ token: localStorage.getItem('authToken') || '' }),
    });
  }
  return socket;
}
