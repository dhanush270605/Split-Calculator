import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * API base URL, in priority order:
 *  1. EXPO_PUBLIC_API_URL (inlined at build/update time; set by EAS build profile)
 *  2. expo.extra.apiUrl from app.json (can be changed with an OTA update)
 *  3. development only: the machine running `expo start` (LAN IP), or 10.0.2.2 on the Android emulator
 * There is intentionally NO hardcoded LAN/localhost fallback in release builds.
 */
function resolveBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  const extra = (Constants.expoConfig as any)?.extra?.apiUrl as string | undefined;
  if (extra) return extra.replace(/\/$/, '');
  if (__DEV__) {
    if (Platform.OS === 'web') return `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:4000/api`;
    const hostUri = (Constants.expoConfig as any)?.hostUri as string | undefined;
    const host = hostUri?.split(':')[0] ?? (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
    return `http://${host}:4000/api`;
  }
  return '';
}
let customBaseUrl: string | null = null;
export function getApiBase(): string {
  return customBaseUrl || resolveBase();
}
/** Dev-only escape hatch (login screen). Ignored in release builds. */
export function setApiBaseOverride(url: string | null) {
  customBaseUrl = __DEV__ && url ? url.replace(/\/$/, '') : null;
}
export const API_BASE = resolveBase();
// Token storage: SecureStore on devices, AsyncStorage on web (SecureStore is unavailable there).
const KEY = 'splitcalc.token';
export const tokenStore = {
  async get(): Promise<string | null> {
    try { return Platform.OS === 'web' ? await AsyncStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY); } catch { return null; }
  },
  async set(t: string) { try { Platform.OS === 'web' ? await AsyncStorage.setItem(KEY, t) : await SecureStore.setItemAsync(KEY, t); } catch { } },
  async clear() { try { Platform.OS === 'web' ? await AsyncStorage.removeItem(KEY) : await SecureStore.deleteItemAsync(KEY); } catch { } },
};

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
export const setToken = (t: string | null) => { token = t; };
export const setUnauthorizedHandler = (f: () => void) => { onUnauthorized = f; };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: any) { super(message); }
  get isNetwork() { return this.status === 0; }
}

/** True while a request is being retried because the (free-tier) server is waking up / unreachable. */
export const wakingStore = {
  value: false,
  subs: new Set<(v: boolean) => void>(),
  set(v: boolean) { if (this.value !== v) { this.value = v; this.subs.forEach((f) => f(v)); } },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REQUEST_TIMEOUT_MS = 25000;
const UPLOAD_TIMEOUT_MS = 120000; // photos over mobile data can take a while
const WAKE_RETRY_WINDOW_MS = 75000; // Render free instances can take ~50 s to cold start

async function once(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(timer); }
}

export async function api<T = any>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const baseUrl = getApiBase();
  if (!baseUrl) throw new ApiError(0, 'The app is not configured with a server address. Please install the latest version.', 'NO_API_URL');
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const init: RequestInit = { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) };
  // Safe to retry: reads, logins, and writes carrying an idempotency key (the server de-duplicates them).
  const retryable = method === 'GET' || path === '/auth/login' || (!!body && typeof body === 'object' && 'idempotencyKey' in (body as any));
  const started = Date.now();
  let attempt = 0;
  let res: Response | null = null;
  let lastErr: unknown = null;
  for (;;) {
    try {
      res = await once(baseUrl + path, init, form ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
      if (retryable && [502, 503, 504].includes(res.status) && Date.now() - started < WAKE_RETRY_WINDOW_MS) { const st = res.status; res = null; throw new Error(`gateway ${st}`); }
      break;
    } catch (e) {
      lastErr = e;
      if (!retryable || Date.now() - started >= WAKE_RETRY_WINDOW_MS) { res = null; break; }
      wakingStore.set(true);
      await sleep(Math.min(2000 + attempt * 1500, 6000));
      attempt++;
    }
  }
  wakingStore.set(false);
  if (!res) {
    if (__DEV__) console.warn(`[api] ${method} ${baseUrl}${path} failed:`, lastErr);
    const timedOut = /abort/i.test(String((lastErr as any)?.name) + String((lastErr as any)?.message));
    throw new ApiError(0, timedOut
      ? 'The server is taking too long to respond. Please try again in a moment.'
      : form ? 'Upload failed. Check your internet connection, or try a smaller photo.'
      : `Can't connect to the server. Check your internet connection and try again.${__DEV__ ? ` (${baseUrl})` : ''}`, timedOut ? 'TIMEOUT' : 'NETWORK');
  }
  const json: any = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    // If the response has a well-formed API error body, use its message.
    const apiMsg = json?.error?.message as string | undefined;
    let msg: string;
    if (apiMsg) {
      msg = apiMsg;
    } else if (res.status === 404) {
      // Bare 404 without an API body means the request hit the hosting router, not our server
      msg = 'Cannot find the server. Please update the app or try again later.';
    } else if (res.status >= 500) {
      msg = 'The server had a problem. Please try again shortly.';
    } else {
      msg = `Something went wrong (${res.status}). Please try again.`;
    }
    if (__DEV__) console.warn(`[api] ${method} ${baseUrl}${path} → ${res.status}`, json);
    throw new ApiError(res.status, msg, json?.error?.code ?? `HTTP_${res.status}`, json?.error?.details);
  }
  if (json === null) throw new ApiError(res.status, 'The server sent an unexpected response.', 'BAD_RESPONSE');
  return json as T;
}

export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b: unknown = {}) => api<T>('POST', p, b);
export const patch = <T = any>(p: string, b: unknown = {}) => api<T>('PATCH', p, b);
export const del = <T = any>(p: string) => api<T>('DELETE', p);

/** Upload an image/PDF (expo-image-picker asset) as evidence. */
export async function uploadAttachment(entityType: string, entityId: number, file: { uri: string; name?: string; mimeType?: string; file?: File }, kind?: string) {
  const f = new FormData();
  f.append('entityType', entityType); f.append('entityId', String(entityId)); if (kind) f.append('kind', kind);
  if (Platform.OS === 'web') {
    const blob = file.file ?? (await (await fetch(file.uri)).blob());
    f.append('file', blob, file.name ?? 'evidence');
  } else {
    f.append('file', { uri: file.uri, name: file.name ?? 'evidence.jpg', type: file.mimeType ?? 'image/jpeg' } as any);
  }
  return api('POST', '/attachments', undefined, f);
}

/** Fetch a protected attachment as a blob/data URL (auth header required, so <Image uri> alone cannot be used). */
export async function fetchAttachmentUri(id: number): Promise<string> {
  const res = await fetch(`${getApiBase()}/attachments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiError(res.status, 'Could not load file');
  const blob = await res.blob();
  if (Platform.OS === 'web') return URL.createObjectURL(blob);
  return await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 8)}`;

/** Best-effort crash reporting to the admin error centre. */
export function reportClientError(message: string, stack?: string, screen?: string) {
  if (!token) return;
  api('POST', '/client-errors', { message: message.slice(0, 900), stack: stack?.slice(0, 3900), screen, device: `${Platform.OS} ${Platform.Version}` }).catch(() => { });
}
