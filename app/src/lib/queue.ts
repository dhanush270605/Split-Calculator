import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, post } from './api';

/**
 * Offline queue for financial mutations. Every item carries an idempotency key, so a retry after a
 * flaky response can never create a duplicate expense/settlement on the server.
 */
const KEY = 'splitcalc.queue.v1';
export interface QueueItem { id: string; method: 'POST'; path: string; body: any; label: string; createdAt: string; lastError?: string }

async function read(): Promise<QueueItem[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'); } catch { return []; }
}
async function write(items: QueueItem[]) { await AsyncStorage.setItem(KEY, JSON.stringify(items)); }

export const queue = {
  list: read,
  async add(item: Omit<QueueItem, 'createdAt'>) { const q = await read(); if (!q.some((i) => i.id === item.id)) q.push({ ...item, createdAt: new Date().toISOString() }); await write(q); },
  async remove(id: string) { await write((await read()).filter((i) => i.id !== id)); },
  /** Replays queued items in order. Stops at the first network failure; drops items the server permanently rejects (4xx) and records the reason. */
  async flush(): Promise<{ sent: number; failed: QueueItem[]; remaining: number }> {
    let sent = 0;
    const failed: QueueItem[] = [];
    const items = await read();
    const keep: QueueItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      try {
        await post(it.path, it.body);
        sent++;
      } catch (e) {
        if (e instanceof ApiError && e.isNetwork) { keep.push(...items.slice(i)); break; }
        if (e instanceof ApiError && e.status >= 500) { keep.push({ ...it, lastError: e.message }); continue; }
        failed.push({ ...it, lastError: e instanceof Error ? e.message : 'Rejected' }); // permanent rejection: surface to user
      }
    }
    await write(keep);
    if (failed.length) await AsyncStorage.setItem(KEY + '.failed', JSON.stringify([...(JSON.parse((await AsyncStorage.getItem(KEY + '.failed')) ?? '[]')), ...failed]));
    return { sent, failed, remaining: keep.length };
  },
  async failed(): Promise<QueueItem[]> { try { return JSON.parse((await AsyncStorage.getItem(KEY + '.failed')) ?? '[]'); } catch { return []; } },
  async clearFailed() { await AsyncStorage.removeItem(KEY + '.failed'); },
};

/** Try now; if the network is down, queue it (same idempotency key) and tell the caller. */
export async function submitOrQueue(label: string, path: string, body: { idempotencyKey: string } & Record<string, any>) {
  try {
    const r = await post(path, body);
    return { queued: false as const, result: r };
  } catch (e) {
    if (e instanceof ApiError && e.isNetwork) {
      await queue.add({ id: body.idempotencyKey, method: 'POST', path, body, label });
      return { queued: true as const, result: null };
    }
    throw e;
  }
}
