import axios from 'axios';

export const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:4100/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
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
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) return Promise.reject(error);

      try {
        if (!refreshing) {
          refreshing = axios
            .post(`${API_URL}/auth/refresh`, { refreshToken })
            .then((res) => res.data?.data || res.data)
            .finally(() => {
              refreshing = null;
            });
        }
        const data = await refreshing;
        if (data?.accessToken) {
          localStorage.setItem('accessToken', data.accessToken);
          if (data.refreshToken)
            localStorage.setItem('refreshToken', data.refreshToken);
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        }
      } catch (err) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        return Promise.reject(err);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
