import type { DB } from '../db.js';
import { computeLedger, simplifyDebts, LedgerExpense, LedgerPayment } from '../engine/balances.js';

export function loadLedgerInputs(db: DB, eventId: number) {
  const rows = db.prepare(
    `SELECT id, category, status, amount_paise, payer_type, payer_user_id, payer_confirmed FROM expenses WHERE event_id=? AND status<>'CANCELLED'`,
  ).all(eventId) as any[];
  const allocs = db.prepare(
    `SELECT a.expense_id, a.user_id, a.share_paise, a.approval_status FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id WHERE e.event_id=?`,
  ).all(eventId) as any[];
  const byExp = new Map<number, LedgerExpense['allocations']>();
  for (const a of allocs) {
    if (!byExp.has(a.expense_id)) byExp.set(a.expense_id, []);
    byExp.get(a.expense_id)!.push({ userId: a.user_id, sharePaise: a.share_paise, approval: a.approval_status });
  }
  const expenses: LedgerExpense[] = rows.map((r) => ({
    id: r.id, category: r.category, status: r.status, amountPaise: r.amount_paise, payerType: r.payer_type,
    payerUserId: r.payer_user_id, payerConfirmed: !!r.payer_confirmed, allocations: byExp.get(r.id) ?? [],
  }));
  const payments = (db.prepare(`SELECT from_user_id, to_user_id, amount_paise, status FROM settlements WHERE event_id=?`).all(eventId) as any[])
    .map((p): LedgerPayment => ({ fromUserId: p.from_user_id, toUserId: p.to_user_id, amountPaise: p.amount_paise, status: p.status }));
  return { expenses, payments };
}

export function eventLedger(db: DB, eventId: number) {
  const { expenses, payments } = loadLedgerInputs(db, eventId);
  const memberIds = (db.prepare(`SELECT user_id FROM event_participants WHERE event_id=?`).all(eventId) as any[]).map((r) => r.user_id);
  const ledger = computeLedger(expenses, payments, memberIds);
  const suggestions = simplifyDebts(ledger.balances);
  return { ...ledger, suggestions };
}

/** Amounts in flight (marked paid / initiated, not yet confirmed) by payer, so users cannot over-pay. */
export function inFlight(db: DB, eventId: number) {
  const rows = db.prepare(
    `SELECT from_user_id, to_user_id, SUM(amount_paise) s FROM settlements WHERE event_id=? AND status IN ('PENDING','PAYMENT_INITIATED','PAID','DISPUTED') GROUP BY from_user_id, to_user_id`,
  ).all(eventId) as any[];
  const out = new Map<number, number>();
  const inc = new Map<number, number>();
  for (const r of rows) {
    out.set(r.from_user_id, (out.get(r.from_user_id) ?? 0) + r.s);
    inc.set(r.to_user_id, (inc.get(r.to_user_id) ?? 0) + r.s);
  }
  return { out, inc };
}
