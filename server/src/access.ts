import type { DB } from './db.js';
import type { AuthUser } from './auth.js';
import { forbidden, notFound } from './errors.js';

export interface EventRow {
  id: number; name: string; type: string; status: string; start_date: string; end_date: string;
  visibility: string; created_by: number; [k: string]: any;
}

export function getEventRow(db: DB, eventId: number): EventRow {
  const ev = db.prepare(`SELECT * FROM events WHERE id=?`).get(eventId) as EventRow | undefined;
  if (!ev) throw notFound('Event not found');
  return ev;
}

export const membership = (db: DB, eventId: number, userId: number) =>
  (db.prepare(`SELECT status FROM event_participants WHERE event_id=? AND user_id=?`).get(eventId, userId) as { status: string } | undefined)?.status ?? null;

export const isActiveMember = (db: DB, eventId: number, userId: number) => membership(db, eventId, userId) === 'ACTIVE';

/** Event is visible to admins and to anyone who is/was a participant (unless admin-only). */
export function loadEventForUser(db: DB, user: AuthUser, eventId: number): EventRow {
  const ev = getEventRow(db, eventId);
  if (user.role === 'ADMIN') return ev;
  if (ev.visibility === 'ADMIN_ONLY' || membership(db, eventId, user.id) === null) throw notFound('Event not found'); // do not reveal existence
  return ev;
}

/** Active (or admin) participation is required to create/change data inside an event. */
export function requireActiveMember(db: DB, user: AuthUser, eventId: number) {
  if (user.role === 'ADMIN') return;
  if (!isActiveMember(db, eventId, user.id)) throw forbidden('You are not an active participant of this event');
}

/**
 * SQL predicate for expense visibility (alias `e`). Frontend filtering is never relied upon.
 * PUBLIC: any participant of the event. PRIVATE: creator, payer, involved participants, admin.
 */
export function expenseVisibilitySql(user: AuthUser): { sql: string; params: any[] } {
  if (user.role === 'ADMIN') return { sql: '1=1', params: [] };
  return {
    sql: `(
      (e.visibility='PUBLIC' AND EXISTS (SELECT 1 FROM event_participants ep WHERE ep.event_id=e.event_id AND ep.user_id=?))
      OR e.creator_id=? OR e.payer_user_id=?
      OR EXISTS (SELECT 1 FROM expense_allocations a WHERE a.expense_id=e.id AND a.user_id=?)
    )`,
    params: [user.id, user.id, user.id, user.id],
  };
}

export function getExpenseForUser(db: DB, user: AuthUser, expenseId: number): any {
  const vis = expenseVisibilitySql(user);
  const row = db.prepare(`SELECT e.* FROM expenses e WHERE e.id=? AND ${vis.sql}`).get(expenseId, ...vis.params);
  if (!row) throw notFound('Expense not found'); // 404 rather than 403: do not reveal private expenses exist
  return row;
}

export function isInvolved(db: DB, expense: any, userId: number): boolean {
  if (expense.creator_id === userId || expense.payer_user_id === userId) return true;
  return !!db.prepare(`SELECT 1 FROM expense_allocations WHERE expense_id=? AND user_id=?`).get(expense.id, userId);
}

export function canAccessAttachment(db: DB, user: AuthUser, att: { entity_type: string; entity_id: number; uploader_id: number }): boolean {
  if (user.role === 'ADMIN' || att.uploader_id === user.id) return true;
  switch (att.entity_type) {
    case 'EXPENSE':
      try { getExpenseForUser(db, user, att.entity_id); return true; } catch { return false; }
    case 'SETTLEMENT': {
      const s = db.prepare(`SELECT from_user_id, to_user_id FROM settlements WHERE id=?`).get(att.entity_id) as any;
      return !!s && (s.from_user_id === user.id || s.to_user_id === user.id);
    }
    case 'TRAVEL': {
      const t = db.prepare(`SELECT event_id FROM travel_segments WHERE id=?`).get(att.entity_id) as any;
      return !!t && membership(db, t.event_id, user.id) !== null;
    }
    case 'DISPUTE': {
      const d = db.prepare(`SELECT raised_by, expense_id FROM disputes WHERE id=?`).get(att.entity_id) as any;
      return !!d && d.raised_by === user.id;
    }
    case 'EVENT':
      return membership(db, att.entity_id, user.id) !== null;
    case 'PROFILE':
      return true; // avatars: any signed-in user
    default:
      return false; // PROBLEM reports: uploader + admin only
  }
}
