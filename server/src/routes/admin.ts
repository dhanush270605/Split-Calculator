import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { notFound } from '../errors.js';
import { audit, camel, camelAll } from '../helpers.js';
import { parse, intQuery } from '../validate.js';
import { getEventRow, expenseVisibilitySql, loadEventForUser } from '../access.js';
import { eventLedger } from '../services/ledger.js';
import { csvEscape } from '../csv.js';

const startedAt = Date.now();

function eventSummary(db: DB, eventId: number) {
  const l = eventLedger(db, eventId);
  const names = new Map((db.prepare(`SELECT id, name FROM users`).all() as any[]).map((u) => [u.id, u.name]));
  const settled = (db.prepare(`SELECT COALESCE(SUM(amount_paise),0) s FROM settlements WHERE event_id=? AND status='CONFIRMED'`).get(eventId) as any).s;
  const inflight = (db.prepare(`SELECT COALESCE(SUM(amount_paise),0) s FROM settlements WHERE event_id=? AND status IN ('PAID','PAYMENT_INITIATED','PENDING','DISPUTED')`).get(eventId) as any).s;
  const outstanding = l.balances.reduce((a, b) => a + Math.max(0, b.netPaise), 0);
  const cats = db.prepare(`SELECT category, SUM(amount_paise) total_paise, COUNT(*) count FROM expenses WHERE event_id=? AND status<>'CANCELLED' GROUP BY category ORDER BY total_paise DESC`).all(eventId);
  const vis = db.prepare(`SELECT visibility, COUNT(*) count, SUM(amount_paise) total_paise FROM expenses WHERE event_id=? AND status<>'CANCELLED' GROUP BY visibility`).all(eventId);
  const st = db.prepare(`SELECT status, COUNT(*) count FROM expenses WHERE event_id=? GROUP BY status`).all(eventId);
  const ap = db.prepare(`SELECT a.approval_status status, COUNT(*) count FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id WHERE e.event_id=? AND e.status<>'CANCELLED' GROUP BY a.approval_status`).all(eventId);
  const budget = db.prepare(
    `SELECT b.category, b.amount_paise budget_paise, COALESCE((SELECT SUM(amount_paise) FROM expenses e WHERE e.event_id=b.event_id AND e.category=b.category AND e.status<>'CANCELLED'),0) actual_paise FROM event_budgets b WHERE b.event_id=?`,
  ).all(eventId);
  return {
    event: camel(getEventRow(db, eventId)),
    financial: { ...l.totals, outstandingPaise: outstanding, settledPaise: settled, inFlightPaise: inflight },
    userWise: l.balances.map((b) => ({ ...b, name: names.get(b.userId) })),
    suggestions: l.suggestions.map((s) => ({ ...s, fromName: names.get(s.fromUserId), toName: names.get(s.toUserId) })),
    categories: camelAll(cats), visibility: camelAll(vis), expenseStatus: camelAll(st), approvalStats: camelAll(ap), budgetVsActual: camelAll(budget),
  };
}

export function adminRouter(db: DB) {
  const r = Router();
  r.use(requireAuth(db));

  // ---------- user-level dashboard & reports (any signed-in user) ----------
  r.get('/dashboard/me', (req, res) => {
    const u = req.user!;
    const events = (u.role === 'ADMIN'
      ? db.prepare(`SELECT id, status FROM events`).all()
      : db.prepare(`SELECT e.id, e.status FROM events e JOIN event_participants p ON p.event_id=e.id WHERE p.user_id=? AND e.visibility='PARTICIPANTS'`).all(u.id)) as any[];
    let owed = 0, receivable = 0;
    for (const e of events) {
      const b = eventLedger(db, e.id).balances.find((x) => x.userId === u.id);
      if (b) { if (b.netPaise < 0) owed += -b.netPaise; else receivable += b.netPaise; }
    }
    const one = (sql: string, ...p: any[]) => (db.prepare(sql).get(...p) as any).s ?? 0;
    const vis = expenseVisibilitySql(u);
    res.json({
      trips: { total: events.length, active: events.filter((e) => e.status === 'ACTIVE').length, completed: events.filter((e) => e.status === 'COMPLETED').length, upcoming: events.filter((e) => e.status === 'UPCOMING').length },
      totalSpentPaise: one(`SELECT SUM(amount_paise) s FROM expenses WHERE payer_user_id=? AND payer_confirmed=1 AND status<>'CANCELLED'`, u.id),
      personalPaise: one(`SELECT SUM(amount_paise) s FROM expenses WHERE payer_user_id=? AND category='PERSONAL' AND status<>'CANCELLED'`, u.id),
      groupPaidPaise: one(`SELECT SUM(amount_paise) s FROM expenses WHERE payer_user_id=? AND payer_confirmed=1 AND category<>'PERSONAL' AND payer_type IN ('INDIVIDUAL','GROUP_MEMBER') AND status<>'CANCELLED'`, u.id),
      owedPaise: owed, receivablePaise: receivable, netPaise: receivable - owed,
      pendingApprovals: one(`SELECT COUNT(*) s FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id WHERE a.user_id=? AND a.approval_status='PENDING' AND e.status NOT IN ('CANCELLED','SETTLED')`, u.id)
        + one(`SELECT COUNT(*) s FROM expenses WHERE payer_user_id=? AND payer_confirmed=0 AND status NOT IN ('CANCELLED','SETTLED')`, u.id),
      pendingSettlements: one(`SELECT COUNT(*) s FROM settlements WHERE ((to_user_id=? AND status IN ('PAID','PAYMENT_INITIATED')) OR (from_user_id=? AND status='PENDING'))`, u.id, u.id),
      unreadNotifications: one(`SELECT COUNT(*) s FROM notifications WHERE user_id=? AND read_at IS NULL`, u.id),
      recentExpenses: camelAll(db.prepare(
        `SELECT e.id, e.title, e.amount_paise, e.category, e.status, e.event_id, ev.name event_name, e.spent_at FROM expenses e JOIN events ev ON ev.id=e.event_id WHERE ${vis.sql} AND e.status<>'CANCELLED' ORDER BY e.id DESC LIMIT 5`,
      ).all(...vis.params)),
    });
  });

  r.get('/reports/me', (req, res) => {
    const u = req.user!;
    const eventId = req.query.eventId ? Number(req.query.eventId) : null;
    if (eventId) loadEventForUser(db, u, eventId);
    const cats = db.prepare(
      `SELECT e.category, SUM(CASE WHEN e.category='PERSONAL' THEN e.amount_paise ELSE a.share_paise END) total_paise, COUNT(*) count
       FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id
       WHERE a.user_id=? AND a.approval_status='APPROVED' AND e.status<>'CANCELLED' AND (? IS NULL OR e.event_id=?) GROUP BY e.category ORDER BY total_paise DESC`,
    ).all(u.id, eventId, eventId);
    const events = eventId ? [{ id: eventId }] : (db.prepare(`SELECT event_id id FROM event_participants WHERE user_id=?`).all(u.id) as any[]);
    let owed = 0, recv = 0, paid = 0, personal = 0;
    for (const e of events) {
      const b = eventLedger(db, e.id).balances.find((x) => x.userId === u.id);
      if (!b) continue;
      paid += b.paidPaise; personal += b.personalPaise;
      if (b.netPaise < 0) owed += -b.netPaise; else recv += b.netPaise;
    }
    res.json({ categories: camelAll(cats), paidPaise: paid, personalPaise: personal, owedPaise: owed, receivablePaise: recv });
  });

  // ---------- admin-only ----------
  const a = Router();
  a.use(requireAdmin);

  a.get('/dashboard', (_req, res) => {
    const one = (sql: string, ...p: any[]) => (db.prepare(sql).get(...p) as any).s ?? 0;
    const events = db.prepare(`SELECT id FROM events`).all() as any[];
    let owed = 0, recv = 0;
    for (const e of events) for (const b of eventLedger(db, e.id).balances) { if (b.netPaise < 0) owed += -b.netPaise; else recv += b.netPaise; }
    const day = `strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')`;
    res.json({
      users: {
        total: one(`SELECT COUNT(*) s FROM users`), active: one(`SELECT COUNT(*) s FROM users WHERE status='ACTIVE'`), inactive: one(`SELECT COUNT(*) s FROM users WHERE status<>'ACTIVE'`),
        recent: camelAll(db.prepare(`SELECT id, name, username, role, status, created_at FROM users ORDER BY id DESC LIMIT 5`).all()),
      },
      events: {
        active: one(`SELECT COUNT(*) s FROM events WHERE status='ACTIVE'`), upcoming: one(`SELECT COUNT(*) s FROM events WHERE status='UPCOMING'`), completed: one(`SELECT COUNT(*) s FROM events WHERE status='COMPLETED'`),
        trips: one(`SELECT COUNT(*) s FROM events WHERE type='TRIP'`), hackathons: one(`SELECT COUNT(*) s FROM events WHERE type='HACKATHON'`), hybrid: one(`SELECT COUNT(*) s FROM events WHERE type='HACKATHON_TRIP'`),
      },
      expenses: {
        total: one(`SELECT COUNT(*) s FROM expenses WHERE status<>'CANCELLED'`), totalPaise: one(`SELECT SUM(amount_paise) s FROM expenses WHERE status<>'CANCELLED'`),
        pendingApproval: one(`SELECT COUNT(*) s FROM expenses WHERE status='PENDING_APPROVAL'`), disputed: one(`SELECT COUNT(*) s FROM expenses WHERE status='DISPUTED'`),
        declined: one(`SELECT COUNT(*) s FROM expenses WHERE status='DECLINED'`),
        private: one(`SELECT COUNT(*) s FROM expenses WHERE visibility='PRIVATE' AND status<>'CANCELLED'`), public: one(`SELECT COUNT(*) s FROM expenses WHERE visibility='PUBLIC' AND status<>'CANCELLED'`),
        sponsoredPaise: one(`SELECT SUM(amount_paise) s FROM expenses WHERE payer_type NOT IN ('INDIVIDUAL','GROUP_MEMBER') AND status<>'CANCELLED'`),
      },
      settlements: {
        owedPaise: owed, receivablePaise: recv, pending: one(`SELECT COUNT(*) s FROM settlements WHERE status IN ('PENDING','PAYMENT_INITIATED','PAID')`),
        disputed: one(`SELECT COUNT(*) s FROM settlements WHERE status='DISPUTED'`), openDisputes: one(`SELECT COUNT(*) s FROM disputes WHERE status IN ('OPEN','UNDER_REVIEW')`),
      },
      system: {
        errors24h: one(`SELECT COUNT(*) s FROM system_errors WHERE level='ERROR' AND created_at > ${day}`), unresolvedErrors: one(`SELECT COUNT(*) s FROM system_errors WHERE resolved=0`),
        failedLogins24h: one(`SELECT COUNT(*) s FROM audit_logs WHERE action='LOGIN_FAILED' AND created_at > ${day}`),
        notificationFailures: one(`SELECT COUNT(*) s FROM system_errors WHERE source='notification'`), storageFailures: one(`SELECT COUNT(*) s FROM system_errors WHERE source IN ('storage','upload')`),
        databaseErrors: one(`SELECT COUNT(*) s FROM system_errors WHERE source='database'`), openProblems: one(`SELECT COUNT(*) s FROM problem_reports WHERE status<>'RESOLVED'`),
      },
    });
  });

  a.get('/audit', (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const where = ['1=1']; const p: any[] = [];
    if (q.actorId) { where.push('actor_id=?'); p.push(Number(q.actorId)); }
    if (q.action) { where.push('action=?'); p.push(q.action); }
    if (q.entityType) { where.push('entity_type=?'); p.push(q.entityType); }
    if (q.entityId) { where.push('entity_id=?'); p.push(Number(q.entityId)); }
    if (q.eventId) { where.push('event_id=?'); p.push(Number(q.eventId)); }
    if (q.search) { where.push('(action LIKE ? OR actor_name LIKE ? OR metadata LIKE ?)'); p.push(`%${q.search}%`, `%${q.search}%`, `%${q.search}%`); }
    const limit = intQuery(q.limit, 50, 1, 200), offset = intQuery(q.offset, 0, 0, 1e7);
    const total = (db.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE ${where.join(' AND ')}`).get(...p) as any).c;
    const rows = db.prepare(`SELECT * FROM audit_logs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...p, limit, offset);
    res.json({ logs: camelAll(rows), total });
  });

  a.get('/errors', (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const where = ['1=1']; const p: any[] = [];
    if (q.level) { where.push('level=?'); p.push(q.level); }
    if (q.source) { where.push('source=?'); p.push(q.source); }
    if (q.resolved) { where.push('resolved=?'); p.push(q.resolved === 'true' ? 1 : 0); }
    if (q.search) { where.push('(message LIKE ? OR source LIKE ?)'); p.push(`%${q.search}%`, `%${q.search}%`); }
    const rows = db.prepare(`SELECT * FROM system_errors WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...p, intQuery(q.limit, 100, 1, 500));
    const bySource = db.prepare(`SELECT source, COUNT(*) count FROM system_errors WHERE resolved=0 GROUP BY source`).all();
    res.json({ errors: camelAll(rows).map((e: any) => ({ ...e, resolved: !!e.resolved })), bySource: camelAll(bySource) });
  });
  a.post('/errors/:id/resolve', (req, res) => {
    const c = db.prepare(`UPDATE system_errors SET resolved=1 WHERE id=?`).run(Number(req.params.id)).changes;
    if (!c) throw notFound('Error not found');
    audit(db, req.user!, 'ERROR_RESOLVED', 'SYSTEM_ERROR', Number(req.params.id));
    res.json({ ok: true });
  });

  a.get('/health', (_req, res) => {
    let dbOk = true; let integrity = 'ok';
    try { integrity = (db.prepare(`PRAGMA quick_check`).get() as any).quick_check; } catch { dbOk = false; }
    const count = (t: string) => (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as any).c;
    const orphan = (db.prepare(`PRAGMA foreign_key_check`).all() as any[]).length;
    res.json({
      status: dbOk && integrity === 'ok' && orphan === 0 ? 'HEALTHY' : 'DEGRADED', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), node: process.version,
      database: { ok: dbOk, integrity, foreignKeyViolations: orphan },
      counts: { users: count('users'), events: count('events'), expenses: count('expenses'), settlements: count('settlements'), notifications: count('notifications'), auditLogs: count('audit_logs'), attachments: count('attachments') },
    });
  });

  a.get('/reports/event/:id', (req, res) => {
    const id = Number(req.params.id);
    const s = eventSummary(db, id);
    if (req.query.format === 'csv') {
      const lines = ['user,paid_inr,owed_inr,personal_inr,settled_out_inr,settled_in_inr,net_inr'];
      for (const u of s.userWise) lines.push([u.name, u.paidPaise, u.owedPaise, u.personalPaise, u.settledOutPaise, u.settledInPaise, u.netPaise].map((v, i) => (i === 0 ? csvEscape(v) : (Number(v) / 100).toFixed(2))).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="event-${id}-balances.csv"`);
      return res.send(lines.join('\n'));
    }
    res.json(s);
  });

  r.use('/admin', a);

  // Event financial summary for participants (aggregates over everything the user may see)
  r.get('/events/:id/summary', (req, res) => {
    const id = Number(req.params.id);
    loadEventForUser(db, req.user!, id);
    const s = eventSummary(db, id);
    if (req.user!.role === 'ADMIN') return res.json(s);
    // Participants get the group money picture, without per-expense detail of private items.
    res.json({ event: s.event, financial: s.financial, userWise: s.userWise.map((u) => ({ userId: u.userId, name: u.name, netPaise: u.netPaise })), suggestions: s.suggestions, budgetVsActual: s.budgetVsActual });
  });
  return r;
}
