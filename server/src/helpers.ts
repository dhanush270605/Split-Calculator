import type { DB } from './db.js';

export type Level = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ACTION_REQUIRED';

export interface Actor { id: number; name: string; role: 'ADMIN' | 'USER' }

const j = (v: unknown) => (v === undefined ? null : JSON.stringify(v));

export async function audit(
  db: DB,
  actor: Actor | null,
  action: string,
  entityType: string | null,
  entityId: number | null,
  opts: { eventId?: number | null; metadata?: unknown; previous?: unknown; next?: unknown } = {},
) {
  await db.run(
    `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, event_id, metadata, previous_state, new_state)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    actor?.id ?? null, actor?.name ?? null, action, entityType, entityId, opts.eventId ?? null, j(opts.metadata), j(opts.previous), j(opts.next),
  );
}

export interface NotifyInput {
  type: string; level?: Level; title: string; body?: string;
  entityType?: string; entityId?: number; eventId?: number;
}

/** In-app notification. A failure never breaks the business operation (savepoint) and is logged as a system error. */
export async function notify(db: DB, userIds: number[], n: NotifyInput) {
  for (const uid of new Set(userIds)) {
    const r = await db.attempt(async () => {
      await db.run(
        `INSERT INTO notifications (user_id, type, level, title, body, entity_type, entity_id, event_id) VALUES (?,?,?,?,?,?,?,?)`,
        uid, n.type, n.level ?? 'INFO', n.title, n.body ?? null, n.entityType ?? null, n.entityId ?? null, n.eventId ?? null,
      );
    });
    if (!r.ok) await logSystemError(db, 'notification', r.error, { userId: uid, type: n.type });
  }
}

export async function adminIds(db: DB): Promise<number[]> {
  return (await db.all<{ id: number }>(`SELECT id FROM users WHERE role='ADMIN' AND status='ACTIVE'`)).map((r) => r.id);
}
export async function notifyAdmins(db: DB, n: NotifyInput, except?: number) {
  await notify(db, (await adminIds(db)).filter((i) => i !== except), n);
}

export async function logSystemError(db: DB, source: string, err: unknown, context?: unknown, userId?: number | null, level: 'ERROR' | 'WARNING' = 'ERROR') {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error(`[${source}]`, e.message);
    await db.attempt(async () => {
      await db.run(
        `INSERT INTO system_errors (level, source, message, stack, context, user_id) VALUES (?,?,?,?,?,?)`,
        level, source, e.message.slice(0, 2000), e.stack?.slice(0, 4000) ?? null, context === undefined ? null : JSON.stringify(context).slice(0, 4000), userId ?? null,
      );
    });
  } catch {
    /* last resort: never throw from the error logger */
  }
}

/** snake_case row -> camelCase (shallow). */
export function camel<T = any>(row: any): T {
  if (!row) return row;
  const out: any = {};
  for (const [k, v] of Object.entries(row)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  return out;
}
export const camelAll = <T = any>(rows: any[]): T[] => rows.map((r) => camel<T>(r));
