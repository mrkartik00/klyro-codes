import axios from 'axios';

export const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:4100/api/v1';

const TOKEN_KEY = 'klyro_admin_access';
const REFRESH_KEY = 'klyro_admin_refresh';

export const tokenStore = {
  get access() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ accessToken, refreshToken }) {
    if (accessToken) localStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const api = axios.create({ baseURL: API_URL });

// Attach bearer token.
api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, try a single refresh + retry.
let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (
      status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retry = true;
      const refreshToken = tokenStore.refresh;
      if (!refreshToken) {
        tokenStore.clear();
        return Promise.reject(error);
      }
      try {
        refreshing =
          refreshing ||
          axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        const { data } = await refreshing;
        refreshing = null;
        const payload = data?.data || data;
        tokenStore.set({
          accessToken: payload.accessToken,
          refreshToken: payload.refreshToken,
        });
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${payload.accessToken}`;
        return api(original);
      } catch (e) {
        refreshing = null;
        tokenStore.clear();
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  }
);

// Unwrap {success, data} envelope. Returns data on success, throws mapped error.
export async function unwrap(promise) {
  const res = await promise;
  const body = res.data;
  if (body && typeof body === 'object' && 'success' in body) {
    if (body.success) return body.data;
    const err = new Error(body.error?.message || 'Request failed');
    err.code = body.error?.code;
    err.details = body.error?.details;
    throw err;
  }
  return body;
}

export default api;
