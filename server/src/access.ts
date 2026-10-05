import type { DB } from './db.js';
import type { AuthUser } from './auth.js';
import { forbidden, notFound } from './errors.js';

export interface EventRow {
  id: number; name: string; type: string; status: string; start_date: string; end_date: string;
  visibility: string; created_by: number; [k: string]: any;
}

export async function getEventRow(db: DB, eventId: number): Promise<EventRow> {
  const ev = await db.get<EventRow>(`SELECT * FROM events WHERE id=?`, eventId);
  if (!ev) throw notFound('Event not found');
  return ev;
}

export const membership = async (db: DB, eventId: number, userId: number) =>
  (await db.get<{ status: string }>(`SELECT status FROM event_participants WHERE event_id=? AND user_id=?`, eventId, userId))?.status ?? null;

export const isActiveMember = async (db: DB, eventId: number, userId: number) => (await membership(db, eventId, userId)) === 'ACTIVE';

/** Event is visible to admins and to anyone who is/was a participant (unless admin-only). */
export async function loadEventForUser(db: DB, user: AuthUser, eventId: number): Promise<EventRow> {
  const ev = await getEventRow(db, eventId);
  if (user.role === 'ADMIN') return ev;
  if (ev.visibility === 'ADMIN_ONLY' || (await membership(db, eventId, user.id)) === null) throw notFound('Event not found'); // do not reveal existence
  return ev;
}

/** Active (or admin) participation is required to create/change data inside an event. */
export async function requireActiveMember(db: DB, user: AuthUser, eventId: number) {
  if (user.role === 'ADMIN') return;
  if (!(await isActiveMember(db, eventId, user.id))) throw forbidden('You are not an active participant of this event');
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

export async function getExpenseForUser(db: DB, user: AuthUser, expenseId: number): Promise<any> {
  const vis = expenseVisibilitySql(user);
  const row = await db.get(`SELECT e.* FROM expenses e WHERE e.id=? AND ${vis.sql}`, expenseId, ...vis.params);
  if (!row) throw notFound('Expense not found'); // 404 rather than 403: do not reveal private expenses exist
  return row;
}

export async function isInvolved(db: DB, expense: any, userId: number): Promise<boolean> {
  if (expense.creator_id === userId || expense.payer_user_id === userId) return true;
  return !!(await db.get(`SELECT 1 x FROM expense_allocations WHERE expense_id=? AND user_id=?`, expense.id, userId));
}

export async function canAccessAttachment(db: DB, user: AuthUser, att: { entity_type: string; entity_id: number; uploader_id: number }): Promise<boolean> {
  if (user.role === 'ADMIN' || att.uploader_id === user.id) return true;
  switch (att.entity_type) {
    case 'EXPENSE':
      try { await getExpenseForUser(db, user, att.entity_id); return true; } catch { return false; }
    case 'SETTLEMENT': {
      const s = await db.get<any>(`SELECT from_user_id, to_user_id FROM settlements WHERE id=?`, att.entity_id);
      return !!s && (s.from_user_id === user.id || s.to_user_id === user.id);
    }
    case 'TRAVEL': {
      const t = await db.get<any>(`SELECT event_id FROM travel_segments WHERE id=?`, att.entity_id);
      return !!t && (await membership(db, t.event_id, user.id)) !== null;
    }
    case 'DISPUTE': {
      const d = await db.get<any>(`SELECT raised_by FROM disputes WHERE id=?`, att.entity_id);
      return !!d && d.raised_by === user.id;
    }
    case 'EVENT':
      return (await membership(db, att.entity_id, user.id)) !== null;
    case 'PROFILE':
      return true; // avatars: any signed-in user
    default:
      return false; // PROBLEM reports: uploader + admin only
  }
}
