import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { errorMessage, getToken, setToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [bootError, setBootError] = useState('');

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Restore the session. Only an explicit 401 ends it: a sleeping/unreachable server
  // (e.g. a Render cold start) must not log the user out.
  const restoreSession = useCallback(() => {
    if (!getToken()) return;
    setLoading(true);
    setBootError('');
    api
      .get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch((err) => {
        if (err.response?.status === 401) logout();
        else setBootError(errorMessage(err));
      })
      .finally(() => setLoading(false));
  }, [logout]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener('tj:unauthorized', onUnauthorized);
    return () => window.removeEventListener('tj:unauthorized', onUnauthorized);
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.data.token);
    setUser(res.data.user);
  }, []);

  const register = useCallback(async (name, email, password) => {
    const res = await api.post('/auth/register', { name, email, password });
    setToken(res.data.token);
    setUser(res.data.user);
  }, []);

  const value = useMemo(
    () => ({ user, loading, bootError, restoreSession, login, register, logout, setUser, currency: user?.baseCurrency || 'INR' }),
    [user, loading, bootError, restoreSession, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
