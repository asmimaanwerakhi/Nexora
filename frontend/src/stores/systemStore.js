import { create } from 'zustand';
import { fetchApiHealth } from '../services/systemApi.js';
import { pingSocketServer } from '../services/systemSocket.js';

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : 'An unexpected connection error occurred';

const initialConnection = {
  status: 'idle',
  error: null,
  checkedAt: null,
};

export const useSystemStore = create((set) => ({
  api: { ...initialConnection },
  socket: { ...initialConnection },

  async checkApi() {
    set((state) => ({ api: { ...state.api, status: 'checking', error: null } }));

    try {
      await fetchApiHealth();
      set({ api: { status: 'online', error: null, checkedAt: new Date().toISOString() } });
    } catch (error) {
      set({
        api: {
          status: 'offline',
          error: getErrorMessage(error),
          checkedAt: new Date().toISOString(),
        },
      });
    }
  },

  async pingSocket() {
    set((state) => ({ socket: { ...state.socket, status: 'checking', error: null } }));

    try {
      await pingSocketServer();
      set({ socket: { status: 'online', error: null, checkedAt: new Date().toISOString() } });
    } catch (error) {
      set({
        socket: {
          status: 'offline',
          error: getErrorMessage(error),
          checkedAt: new Date().toISOString(),
        },
      });
    }
  },
}));
