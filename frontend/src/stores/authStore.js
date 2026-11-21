import { create } from 'zustand';
import { apiClient, setAccessToken } from '../services/apiClient.js';

let initializationRequest;

const getErrorMessage = (error) =>
  error.response?.data?.error?.message ||
  error.message ||
  'Something went wrong. Please try again.';

export const useAuthStore = create((set) => ({
  user: null,
  initialized: false,
  initializing: false,
  sessionRestoreError: '',

  async initialize() {
    if (initializationRequest) {
      return initializationRequest;
    }

    set({ initializing: true });
    initializationRequest = (async () => {
      try {
        const response = await apiClient.post('/auth/refresh');
        const { accessToken, user } = response.data.data;
        setAccessToken(accessToken);
        set({ user, initialized: true, sessionRestoreError: '' });
      } catch (error) {
        setAccessToken(null);
        set({
          user: null,
          initialized: true,
          sessionRestoreError: error.response?.status === 401 ? '' : getErrorMessage(error),
        });
        if (error.response?.status !== 401) {
          console.error('Could not restore the Nexora session', error);
        }
      } finally {
        set({ initializing: false });
        initializationRequest = null;
      }
    })();

    return initializationRequest;
  },

  async signup(values) {
    const response = await apiClient.post('/auth/signup', values);
    return response.data.data;
  },

  async verifyEmail(values) {
    const response = await apiClient.post('/auth/verify-otp', values);
    return response.data.data;
  },

  async resendVerification(email) {
    const response = await apiClient.post('/auth/resend-otp', { email });
    return response.data.data;
  },

  async login(values) {
    const response = await apiClient.post('/auth/login', values);
    const { accessToken, user } = response.data.data;
    setAccessToken(accessToken);
    set({ user, initialized: true, sessionRestoreError: '' });
    return user;
  },

  async requestPasswordReset(email) {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return response.data;
  },

  async resetPassword(values) {
    const response = await apiClient.post('/auth/reset-password', values);
    return response.data.data;
  },

  async updateProfile(values) {
    const response = await apiClient.patch('/users/me', values);
    set({ user: response.data.data.user });
    return response.data.data.user;
  },

  async updatePreferences(values) {
    const response = await apiClient.patch('/users/me/preferences', values);
    set({ user: response.data.data.user });
    return response.data.data.user;
  },

  async uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await apiClient.post('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    set({ user: response.data.data.user });
    return response.data.data.user;
  },

  async uploadCoverPhoto(file) {
    const formData = new FormData();
    formData.append('coverPhoto', file);
    const response = await apiClient.post('/users/me/cover-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    set({ user: response.data.data.user });
    return response.data.data.user;
  },

  async logout() {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setAccessToken(null);
      set({ user: null, initialized: true, sessionRestoreError: '' });
    }
  },

  getErrorMessage,
}));

if (typeof window !== 'undefined') {
  window.addEventListener('nexora:auth-refreshed', (event) => {
    const { accessToken, user } = event.detail;
    setAccessToken(accessToken);
    useAuthStore.setState({ user, initialized: true, sessionRestoreError: '' });
  });

  window.addEventListener('nexora:auth-expired', (event) => {
    setAccessToken(null);
    useAuthStore.setState({
      user: null,
      initialized: true,
      sessionRestoreError: event.detail?.message || 'Your session expired. Please sign in again.',
    });
  });
}

export { getErrorMessage as getAuthErrorMessage };
