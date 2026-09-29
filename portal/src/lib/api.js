import axios from 'axios';

export const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:4100/api/v1';

export const TOKEN_KEY = 'klyro.accessToken';
export const REFRESH_KEY = 'klyro.refreshToken';
export const USER_KEY = 'klyro.user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}
export function setTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}
export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (status === 401 && original && !original._retry) {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        return Promise.reject(error);
      }
      original._retry = true;
      try {
        // Single-flight refresh so parallel 401s share one request.
        refreshing =
          refreshing ||
          axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        const res = await refreshing;
        refreshing = null;
        const data = res.data?.data || res.data;
        setTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        });
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        refreshing = null;
        clearTokens();
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);

// Unwrap the standard {success,data,meta} envelope.
export function unwrap(response) {
  const body = response?.data;
  if (body && typeof body === 'object' && 'data' in body) return body.data;
  return body;
}

export default api;
