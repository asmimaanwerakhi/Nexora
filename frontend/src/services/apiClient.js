import axios from 'axios';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const API_BASE_URL = `${API_URL}/api/v1`;

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let accessToken = null;
let refreshRequest = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

apiClient.interceptors.request.use((config) => {
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    config.headers.delete('Content-Type');
  }
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const requestUrl = request?.url || '';
    const neverRefreshEndpoints = [
      '/auth/login',
      '/auth/signup',
      '/auth/verify-otp',
      '/auth/resend-otp',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/auth/refresh',
      '/auth/logout',
    ];
    const shouldSkipRefresh = neverRefreshEndpoints.includes(requestUrl);

    if (error.response?.status !== 401 || !request || request._retry || shouldSkipRefresh) {
      return Promise.reject(error);
    }

    request._retry = true;
    try {
      refreshRequest ??= axios
        .post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
        .finally(() => {
          refreshRequest = null;
        });

      const response = await refreshRequest;
      const data = response.data.data;
      setAccessToken(data.accessToken);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('nexora:auth-refreshed', {
            detail: { accessToken: data.accessToken, user: data.user },
          }),
        );
      }
      request.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(request);
    } catch (refreshError) {
      setAccessToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('nexora:auth-expired', {
            detail: {
              message:
                refreshError.response?.data?.error?.message ||
                'Your session expired. Please sign in again.',
            },
          }),
        );
      }
      return Promise.reject(refreshError);
    }
  },
);
