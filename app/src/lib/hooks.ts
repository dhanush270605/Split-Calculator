import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ApiError, wakingStore } from './api';

/** Load data on focus with loading/error/refresh state. */
export function useLoad<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setData(await fnRef.current()); setError(null); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(data !== null); }, deps)); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => { setRefreshing(true); return load(true); }, [load]);
  return { data, loading, refreshing, error, reload: load, refresh };
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong');

/** True while the app is retrying because the free-tier server is waking up. */
export function useWaking() {
  const [v, setV] = useState(wakingStore.value);
  useEffect(() => { wakingStore.subs.add(setV); return () => { wakingStore.subs.delete(setV); }; }, []);
  return v;
}
