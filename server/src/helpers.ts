import type { DB } from './db.js';

export type Level = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'ACTION_REQUIRED';

export interface Actor { id: number; name: string; role: 'ADMIN' | 'USER' }

export function audit(
  db: DB,
  actor: Actor | null,
  action: string,
  entityType: string | null,
  entityId: number | null,
  opts: { eventId?: number | null; metadata?: unknown; previous?: unknown; next?: unknown } = {},
) {
  db.prepare(
    `INSERT INTO audit_logs (actor_id, actor_name, action, entity_type, entity_id, event_id, metadata, previous_state, new_state)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    actor?.id ?? null, actor?.name ?? null, action, entityType, entityId, opts.eventId ?? null,
    opts.metadata === undefined ? null : JSON.stringify(opts.metadata),
    opts.previous === undefined ? null : JSON.stringify(opts.previous),
    opts.next === undefined ? null : JSON.stringify(opts.next),
  );
}

export interface NotifyInput {
  type: string; level?: Level; title: string; body?: string;
  entityType?: string; entityId?: number; eventId?: number;
}

/** In-app notification. Failures never break the business operation; they are logged as system errors. */
export function notify(db: DB, userIds: number[], n: NotifyInput) {
  const ins = db.prepare(
    `INSERT INTO notifications (user_id, type, level, title, body, entity_type, entity_id, event_id) VALUES (?,?,?,?,?,?,?,?)`,
  );
  for (const uid of new Set(userIds)) {
    try {
      ins.run(uid, n.type, n.level ?? 'INFO', n.title, n.body ?? null, n.entityType ?? null, n.entityId ?? null, n.eventId ?? null);
    } catch (e) {
      logSystemError(db, 'notification', e, { userId: uid, type: n.type });
    }
  }
}

export function adminIds(db: DB): number[] {
  return (db.prepare(`SELECT id FROM users WHERE role='ADMIN' AND status='ACTIVE'`).all() as { id: number }[]).map((r) => r.id);
}
export const notifyAdmins = (db: DB, n: NotifyInput, except?: number) =>
  notify(db, adminIds(db).filter((i) => i !== except), n);

export function logSystemError(db: DB, source: string, err: unknown, context?: unknown, userId?: number | null, level: 'ERROR' | 'WARNING' = 'ERROR') {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    db.prepare(`INSERT INTO system_errors (level, source, message, stack, context, user_id) VALUES (?,?,?,?,?,?)`).run(
      level, source, e.message.slice(0, 2000), e.stack?.slice(0, 4000) ?? null,
      context === undefined ? null : JSON.stringify(context).slice(0, 4000), userId ?? null,
    );
  } catch {
    /* last resort: never throw from the error logger */
    console.error('[logSystemError failed]', err);
  }
}

/** Strip undefined, convert snake_case row to camelCase (shallow). */
export function camel<T = any>(row: any): T {
  if (!row) return row;
  const out: any = {};
  for (const [k, v] of Object.entries(row)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  return out;
}
export const camelAll = <T = any>(rows: any[]): T[] => rows.map((r) => camel<T>(r));
