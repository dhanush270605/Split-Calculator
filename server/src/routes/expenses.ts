import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { badRequest } from '../errors.js';
import { camel, camelAll } from '../helpers.js';
import { parse, intQuery, optStr, PAYMENT_METHODS, SPLIT_METHODS } from '../validate.js';
import { expenseVisibilitySql, loadEventForUser } from '../access.js';
import { computeSplit, SplitError } from '../engine/split.js';
import {
  createExpense, updateExpense, respondToExpense, cancelExpense, disputeExpense, resolveDispute, expenseDetail, participantSchema,
} from '../services/expenses.js';

export function expensesRouter(db: DB) {
  const r = Router();
  r.use(requireAuth(db));

  // Server-authoritative split preview (used by the app while the user types)
  r.post('/expenses/preview', (req, res) => {
    const d = parse(z.object({ amountPaise: z.number().int().positive(), splitMethod: z.enum(SPLIT_METHODS), participants: z.array(participantSchema).min(1) }), req.body);
    try { res.json({ allocations: computeSplit(d.amountPaise, d.splitMethod, d.participants) }); }
    catch (e) { if (e instanceof SplitError) throw badRequest(e.message); throw e; }
  });

  r.get('/expenses', (req, res) => {
    const u = req.user!;
    const vis = expenseVisibilitySql(u);
    const where: string[] = [vis.sql];
    const params: any[] = [...vis.params];
    const add = (sql: string, ...p: any[]) => { where.push(sql); params.push(...p); };
    const q = req.query as Record<string, string | undefined>;
    if (q.eventId) { loadEventForUser(db, u, Number(q.eventId)); add('e.event_id=?', Number(q.eventId)); }
    if (q.category) add('e.category=?', q.category);
    if (q.status) add('e.status=?', q.status);
    if (q.visibility) add('e.visibility=?', q.visibility);
    if (q.payerId) add('e.payer_user_id=?', Number(q.payerId));
    if (q.paymentMethod) add('e.payment_method=?', q.paymentMethod);
    if (q.from) add('e.spent_at>=?', q.from);
    if (q.to) add('e.spent_at<=?', q.to);
    if (q.minAmount) add('e.amount_paise>=?', Number(q.minAmount));
    if (q.maxAmount) add('e.amount_paise<=?', Number(q.maxAmount));
    if (q.payerType) add('e.payer_type=?', q.payerType);
    if (q.mine === 'true') add(`(e.creator_id=? OR e.payer_user_id=? OR EXISTS (SELECT 1 FROM expense_allocations x WHERE x.expense_id=e.id AND x.user_id=?))`, u.id, u.id, u.id);
    if (q.search) add('(e.title LIKE ? OR e.description LIKE ? OR e.subcategory LIKE ?)', `%${q.search}%`, `%${q.search}%`, `%${q.search}%`);
    const limit = intQuery(q.limit, 30, 1, 100), offset = intQuery(q.offset, 0, 0, 1e6);
    const w = where.join(' AND ');
    const total = (db.prepare(`SELECT COUNT(*) c FROM expenses e WHERE ${w}`).get(...params) as any).c;
    const rows = db.prepare(
      `SELECT e.id, e.event_id, ev.name event_name, e.title, e.category, e.subcategory, e.amount_paise, e.status, e.visibility, e.payer_type, e.payer_user_id,
              COALESCE(p.name, e.payer_name) payer_name, e.creator_id, c.name creator_name, e.payment_method, e.split_method, e.spent_at, e.created_at, e.version,
              (SELECT share_paise FROM expense_allocations a WHERE a.expense_id=e.id AND a.user_id=?) my_share_paise,
              (SELECT approval_status FROM expense_allocations a WHERE a.expense_id=e.id AND a.user_id=?) my_approval
       FROM expenses e JOIN events ev ON ev.id=e.event_id JOIN users c ON c.id=e.creator_id LEFT JOIN users p ON p.id=e.payer_user_id
       WHERE ${w} ORDER BY e.spent_at DESC, e.id DESC LIMIT ? OFFSET ?`,
    ).all(u.id, u.id, ...params, limit, offset);
    res.json({ expenses: camelAll(rows), total, limit, offset });
  });

  // Participant approval inbox
  r.get('/approvals', (req, res) => {
    const rows = db.prepare(
      `SELECT e.id expense_id, e.title, e.category, e.amount_paise, e.event_id, ev.name event_name, a.share_paise, c.name creator_name, COALESCE(p.name, e.payer_name) payer_name, e.spent_at, e.visibility, 'SHARE' kind
       FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id JOIN events ev ON ev.id=e.event_id JOIN users c ON c.id=e.creator_id LEFT JOIN users p ON p.id=e.payer_user_id
       WHERE a.user_id=? AND a.approval_status='PENDING' AND e.status NOT IN ('CANCELLED','SETTLED')
       UNION ALL
       SELECT e.id, e.title, e.category, e.amount_paise, e.event_id, ev.name, 0, c.name, COALESCE(p.name, e.payer_name), e.spent_at, e.visibility, 'PAYER'
       FROM expenses e JOIN events ev ON ev.id=e.event_id JOIN users c ON c.id=e.creator_id LEFT JOIN users p ON p.id=e.payer_user_id
       WHERE e.payer_user_id=? AND e.payer_confirmed=0 AND e.status NOT IN ('CANCELLED','SETTLED')
       ORDER BY spent_at DESC`,
    ).all(req.user!.id, req.user!.id);
    res.json({ approvals: camelAll(rows) });
  });

  r.post('/expenses', (req, res) => {
    const { expense, duplicate } = createExpense(db, req.user!, req.body);
    res.status(duplicate ? 200 : 201).json({ expense, duplicate });
  });
  r.get('/expenses/:id', (req, res) => res.json({ expense: expenseDetail(db, req.user!, Number(req.params.id)) }));
  r.patch('/expenses/:id', (req, res) => res.json({ expense: updateExpense(db, req.user!, Number(req.params.id), req.body) }));
  r.post('/expenses/:id/respond', (req, res) => {
    const d = parse(z.object({ decision: z.enum(['APPROVE', 'DECLINE']), note: optStr(500) }), req.body);
    res.json({ expense: respondToExpense(db, req.user!, Number(req.params.id), d.decision, d.note) });
  });
  r.post('/expenses/:id/cancel', (req, res) => {
    const d = parse(z.object({ reason: optStr(500) }), req.body ?? {});
    res.json({ expense: cancelExpense(db, req.user!, Number(req.params.id), d.reason) });
  });
  r.post('/expenses/:id/dispute', (req, res) => {
    const d = parse(z.object({ reason: z.string().trim().min(3).max(300), message: optStr(2000) }), req.body);
    res.status(201).json(disputeExpense(db, req.user!, Number(req.params.id), d));
  });

  // Admin dispute queue
  r.get('/disputes', requireAdmin, (req, res) => {
    const status = req.query.status ? String(req.query.status) : null;
    const rows = db.prepare(
      `SELECT d.*, u.name raised_by_name, e.title expense_title, e.amount_paise, e.event_id FROM disputes d JOIN users u ON u.id=d.raised_by JOIN expenses e ON e.id=d.expense_id
       WHERE (? IS NULL OR d.status=?) ORDER BY d.id DESC LIMIT 200`,
    ).all(status, status);
    res.json({ disputes: camelAll(rows) });
  });
  r.post('/disputes/:id/resolve', requireAdmin, (req, res) => {
    const d = parse(z.object({ status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'CORRECTED']), note: optStr(1000) }), req.body);
    res.json({ dispute: camel(resolveDispute(db, req.user!, Number(req.params.id), d.status, d.note)) });
  });

  return r;
}
