import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

function resolveBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  if (Platform.OS === 'web') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `http://${host}:4000/api`;
  }
  const hostUri = (Constants.expoConfig as any)?.hostUri as string | undefined; // LAN IP of Expo dev server
  const host = hostUri?.split(':')[0] ?? '192.168.31.158';
  return `http://${host}:4000/api`;
}
export const API_BASE = resolveBase();

// Token storage: SecureStore on devices, AsyncStorage on web (SecureStore is unavailable there).
const KEY = 'splitcalc.token';
export const tokenStore = {
  async get(): Promise<string | null> {
    try { return Platform.OS === 'web' ? await AsyncStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY); } catch { return null; }
  },
  async set(t: string) { try { Platform.OS === 'web' ? await AsyncStorage.setItem(KEY, t) : await SecureStore.setItemAsync(KEY, t); } catch {} },
  async clear() { try { Platform.OS === 'web' ? await AsyncStorage.removeItem(KEY) : await SecureStore.deleteItemAsync(KEY); } catch {} },
};

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
export const setToken = (t: string | null) => { token = t; };
export const setUnauthorizedHandler = (f: () => void) => { onUnauthorized = f; };

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: any) { super(message); }
  get isNetwork() { return this.status === 0; }
}

export async function api<T = any>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)), signal: ctrl.signal });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.', 'NETWORK');
  } finally { clearTimeout(timer); }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, json?.error?.message ?? `Request failed (${res.status})`, json?.error?.code, json?.error?.details);
  }
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
  const res = await fetch(`${API_BASE}/attachments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
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
  api('POST', '/client-errors', { message: message.slice(0, 900), stack: stack?.slice(0, 3900), screen, device: `${Platform.OS} ${Platform.Version}` }).catch(() => {});
}
