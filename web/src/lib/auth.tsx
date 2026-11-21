import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onAuthError, setCsrf } from './api';
import { applyDisplay } from './display';
import { clearQueue, flushQueue } from './offline';
import type { User, UserPrefs } from './types';

interface AppInfo {
  welcomeMessage: string;
  externalServices: boolean;
  passwordMinLength: number;
}

interface AuthCtx {
  user: User | null;
  app: AppInfo | null;
  loading: boolean;
  offline: boolean;
  refresh: () => Promise<void>;
  setSession: (user: User, csrf: string) => void;
  setUser: (u: User) => void;
  updatePrefs: (p: Partial<UserPrefs>) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [app, setApp] = useState<AppInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);

  const setUser = useCallback((u: User) => {
    setUserState(u);
    applyDisplay(u.prefs);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: User; csrf: string; app: AppInfo }>('/auth/me');
      setCsrf(me.csrf);
      // Synchronise d'abord les réponses en attente pour que les compteurs affichés soient à jour.
      if (!me.user.mustChangePassword && navigator.onLine) await flushQueue();
      setApp(me.app);
      setUser(me.user);
    } catch {
      setUserState(null);
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      onAuthError((code) => {
        if (code === 'must_change_password') void refresh();
        else setUserState(null);
      }),
    [refresh],
  );

  useEffect(() => {
    const on = () => {
      setOffline(false);
      void flushQueue();
    };
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      app,
      loading,
      offline,
      refresh,
      setUser,
      setSession: (u, csrf) => {
        setCsrf(csrf);
        setUser(u);
        void refresh();
      },
      updatePrefs: async (p) => {
        if (!user) return;
        const optimistic = { ...user, prefs: { ...user.prefs, ...p } };
        setUser(optimistic);
        const r = await api<{ user: User }>('/me', { method: 'PATCH', body: { prefs: p } });
        setUser(r.user);
      },
      logout: async () => {
        try {
          await api('/auth/logout', { method: 'POST', body: {} });
        } finally {
          clearQueue();
          navigator.serviceWorker?.controller?.postMessage('logout');
          setUserState(null);
        }
      },
    }),
    [user, app, loading, offline, refresh, setUser],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider manquant');
  return c;
}
