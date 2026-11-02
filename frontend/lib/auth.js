'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { cacheGet, cacheSet, clearLocalData } from './offlineQueue';

const AuthContext = createContext(null);

export const HOME_BY_ROLE = { executive: '/onboarding', consultant: '/review', admin: '/review' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api('/auth/me');
      setUser(u);
      await cacheSet('user', u).catch(() => {});
    } catch (err) {
      // Offline: fall back to the last known user so the onboarding draft can still be edited.
      setUser(err.code === 'NETWORK' ? (await cacheGet('user').catch(() => null)) || null : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password, mode = 'login') => {
    const { user: u } = await api(`/auth/${mode}`, { method: 'POST', body: { email, password } });
    const previous = await cacheGet('user').catch(() => null);
    if (previous && previous.id !== u.id) await clearLocalData(); // never show one user's local drafts to another
    await cacheSet('user', u).catch(() => {});
    setUser(u);
    return u;
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    await clearLocalData().catch(() => {});
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh, setUser }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
