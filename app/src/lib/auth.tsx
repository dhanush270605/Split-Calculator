import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { get, post, setToken, setUnauthorizedHandler, tokenStore, ApiError } from './api';
import { queue } from './queue';

export interface Me {
  id: number; username: string; name: string; role: 'ADMIN' | 'USER'; email?: string; phone?: string; college?: string;
  department?: string; year?: string; emergencyContact?: string; status: string; mustChangePassword: boolean; createdAt: string; avatarAttachmentId?: number | null;
}
interface Ctx {
  me: Me | null; ready: boolean; unread: number; queued: number;
  login: (u: string, p: string) => Promise<void>; logout: () => Promise<void>;
  setSession: (token: string, me: Me) => Promise<void>; refreshMe: () => Promise<void>;
  refreshUnread: () => Promise<void>; flushQueue: () => Promise<{ sent: number; failed: number }>; isAdmin: boolean;
}
const C = createContext<Ctx>(null as any);
export const useAuth = () => useContext(C);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [unread, setUnread] = useState(0);
  const [queued, setQueued] = useState(0);
  const meRef = useRef<Me | null>(null);
  meRef.current = me;

  const clear = useCallback(async () => { setToken(null); await tokenStore.clear(); setMe(null); setUnread(0); }, []);
  useEffect(() => { setUnauthorizedHandler(() => { clear(); }); }, [clear]);

  useEffect(() => {
    (async () => {
      const t = await tokenStore.get();
      if (t) {
        setToken(t);
        try { setMe((await get('/auth/me')).user); } catch (e) { if (e instanceof ApiError && e.status === 401) await clear(); }
      }
      setReady(true);
    })();
  }, [clear]);

  const refreshUnread = useCallback(async () => {
    if (!meRef.current || meRef.current.mustChangePassword) return;
    try { setUnread((await get('/notifications/unread-count')).unreadCount); } catch {}
    setQueued((await queue.list()).length);
  }, []);

  const flushQueue = useCallback(async () => {
    const r = await queue.flush();
    setQueued(r.remaining);
    return { sent: r.sent, failed: r.failed.length };
  }, []);

  // Poll for new notifications (free-tier friendly alternative to push) and retry queued writes.
  useEffect(() => {
    if (!me) return;
    refreshUnread();
    const t = setInterval(() => { refreshUnread(); queue.list().then((q) => { if (q.length) flushQueue(); }); }, 15000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { refreshUnread(); flushQueue(); } });
    return () => { clearInterval(t); sub.remove(); };
  }, [me?.id, refreshUnread, flushQueue]);

  const setSession = useCallback(async (token: string, user: Me) => { setToken(token); await tokenStore.set(token); setMe(user); }, []);
  const login = useCallback(async (username: string, password: string) => {
    const r = await post('/auth/login', { username, password });
    await setSession(r.token, r.user);
  }, [setSession]);
  const logout = useCallback(async () => { try { await post('/auth/logout'); } catch {} await clear(); }, [clear]);
  const refreshMe = useCallback(async () => { setMe((await get('/auth/me')).user); }, []);

  return (
    <C.Provider value={{ me, ready, unread, queued, login, logout, setSession, refreshMe, refreshUnread, flushQueue, isAdmin: me?.role === 'ADMIN' }}>
      {children}
    </C.Provider>
  );
}
