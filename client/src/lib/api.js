import axios from 'axios';

const TOKEN_KEY = 'tj_token';

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) – session will not persist */
  }
}

// Generous timeout: a sleeping Render free instance can take ~50s to wake up.
const api = axios.create({ baseURL: API_URL, timeout: 70000 });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url = err.config?.url || '';
    if (status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/register')) {
      window.dispatchEvent(new Event('tj:unauthorized'));
    }
    return Promise.reject(err);
  }
);

/** Human-readable message from an axios error (handles blob responses too). */
export function errorMessage(err, fallback = 'Something went wrong') {
  if (!err) return fallback;
  if (!err.isAxiosError) return err.message || fallback;
  if (err.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (!err.response) return 'Cannot reach the server. Check your connection and try again.';
  return err.response.data?.message || fallback;
}

/** Field-level validation errors returned by the API, keyed by field name. */
export function fieldErrors(err) {
  const e = err?.response?.data?.errors;
  return e && typeof e === 'object' ? e : {};
}

/** Downloads a file from an authenticated endpoint. */
export async function downloadFile(path, fallbackName) {
  const res = await api.get(path, { responseType: 'blob' });
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = match ? match[1] : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default api;
