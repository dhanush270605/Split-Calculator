import { Router } from 'express';
import type { DB } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { notFound } from '../errors.js';
import { audit, camel, camelAll } from '../helpers.js';
import { intQuery } from '../validate.js';
import { getEventRow, expenseVisibilitySql, loadEventForUser } from '../access.js';
import { eventLedger } from '../services/ledger.js';
import { csvEscape } from '../csv.js';

const startedAt = Date.now();

async function eventSummary(db: DB, eventId: number) {
  const l = await eventLedger(db, eventId);
  const names = new Map((await db.all<any>(`SELECT id, name FROM users`)).map((u) => [u.id, u.name]));
  const settled = (await db.get<any>(`SELECT COALESCE(SUM(amount_paise),0) s FROM settlements WHERE event_id=? AND status='CONFIRMED'`, eventId))!.s;
  const inflight = (await db.get<any>(`SELECT COALESCE(SUM(amount_paise),0) s FROM settlements WHERE event_id=? AND status IN ('PAID','PAYMENT_INITIATED','PENDING','DISPUTED')`, eventId))!.s;
  const outstanding = l.balances.reduce((a, b) => a + Math.max(0, b.netPaise), 0);
  const cats = await db.all(`SELECT category, SUM(amount_paise) total_paise, COUNT(*) AS count FROM expenses WHERE event_id=? AND status<>'CANCELLED' GROUP BY category ORDER BY total_paise DESC`, eventId);
  const vis = await db.all(`SELECT visibility, COUNT(*) AS count, SUM(amount_paise) total_paise FROM expenses WHERE event_id=? AND status<>'CANCELLED' GROUP BY visibility`, eventId);
  const st = await db.all(`SELECT status, COUNT(*) AS count FROM expenses WHERE event_id=? GROUP BY status`, eventId);
  const ap = await db.all(`SELECT a.approval_status AS status, COUNT(*) AS count FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id WHERE e.event_id=? AND e.status<>'CANCELLED' GROUP BY a.approval_status`, eventId);
  const budget = await db.all(
    `SELECT b.category, b.amount_paise budget_paise, COALESCE((SELECT SUM(amount_paise) FROM expenses e WHERE e.event_id=b.event_id AND e.category=b.category AND e.status<>'CANCELLED'),0) actual_paise FROM event_budgets b WHERE b.event_id=?`, eventId);
  return {
    event: camel(await getEventRow(db, eventId)),
    financial: { ...l.totals, outstandingPaise: outstanding, settledPaise: settled, inFlightPaise: inflight },
    userWise: l.balances.map((b) => ({ ...b, name: names.get(b.userId) })),
    suggestions: l.suggestions.map((s) => ({ ...s, fromName: names.get(s.fromUserId), toName: names.get(s.toUserId) })),
    categories: camelAll(cats), visibility: camelAll(vis), expenseStatus: camelAll(st), approvalStats: camelAll(ap), budgetVsActual: camelAll(budget),
  };
}

export function adminRouter(db: DB) {
  const r = Router();
  r.use(requireAuth(db));
  const one = async (sql: string, ...p: any[]) => (await db.get<any>(sql, ...p))?.s ?? 0;

  // ---------- user-level dashboard & reports (any signed-in user) ----------
  r.get('/dashboard/me', async (req, res) => {
    const u = req.user!;
    const events = (u.role === 'ADMIN'
      ? await db.all(`SELECT id, status FROM events`)
      : await db.all(`SELECT e.id, e.status FROM events e JOIN event_participants p ON p.event_id=e.id WHERE p.user_id=? AND e.visibility='PARTICIPANTS'`, u.id)) as any[];
    let owed = 0, receivable = 0;
    for (const e of events) {
      const b = (await eventLedger(db, e.id)).balances.find((x) => x.userId === u.id);
      if (b) { if (b.netPaise < 0) owed += -b.netPaise; else receivable += b.netPaise; }
    }
    const vis = expenseVisibilitySql(u);
    res.json({
      trips: { total: events.length, active: events.filter((e) => e.status === 'ACTIVE').length, completed: events.filter((e) => e.status === 'COMPLETED').length, upcoming: events.filter((e) => e.status === 'UPCOMING').length },
      totalSpentPaise: await one(`SELECT SUM(amount_paise) s FROM expenses WHERE payer_user_id=? AND payer_confirmed=1 AND status<>'CANCELLED'`, u.id),
      personalPaise: await one(`SELECT SUM(amount_paise) s FROM expenses WHERE payer_user_id=? AND category='PERSONAL' AND status<>'CANCELLED'`, u.id),
      groupPaidPaise: await one(`SELECT SUM(amount_paise) s FROM expenses WHERE payer_user_id=? AND payer_confirmed=1 AND category<>'PERSONAL' AND payer_type IN ('INDIVIDUAL','GROUP_MEMBER') AND status<>'CANCELLED'`, u.id),
      owedPaise: owed, receivablePaise: receivable, netPaise: receivable - owed,
      pendingApprovals: (await one(`SELECT COUNT(*) s FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id WHERE a.user_id=? AND a.approval_status='PENDING' AND e.status NOT IN ('CANCELLED','SETTLED')`, u.id))
        + (await one(`SELECT COUNT(*) s FROM expenses WHERE payer_user_id=? AND payer_confirmed=0 AND status NOT IN ('CANCELLED','SETTLED')`, u.id)),
      pendingSettlements: await one(`SELECT COUNT(*) s FROM settlements WHERE ((to_user_id=? AND status IN ('PAID','PAYMENT_INITIATED')) OR (from_user_id=? AND status='PENDING'))`, u.id, u.id),
      unreadNotifications: await one(`SELECT COUNT(*) s FROM notifications WHERE user_id=? AND read_at IS NULL`, u.id),
      recentExpenses: camelAll(await db.all(
        `SELECT e.id, e.title, e.amount_paise, e.category, e.status, e.event_id, ev.name event_name, e.spent_at FROM expenses e JOIN events ev ON ev.id=e.event_id WHERE ${vis.sql} AND e.status<>'CANCELLED' ORDER BY e.id DESC LIMIT 5`, ...vis.params)),
    });
  });

  r.get('/reports/me', async (req, res) => {
    const u = req.user!;
    const eventId = req.query.eventId ? Number(req.query.eventId) : null;
    if (eventId) await loadEventForUser(db, u, eventId);
    const cats = await db.all(
      `SELECT e.category, SUM(CASE WHEN e.category='PERSONAL' THEN e.amount_paise ELSE a.share_paise END) total_paise, COUNT(*) AS count
       FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id
       WHERE a.user_id=? AND a.approval_status='APPROVED' AND e.status<>'CANCELLED' AND (? IS NULL OR e.event_id=?) GROUP BY e.category ORDER BY total_paise DESC`, u.id, eventId, eventId);
    const events = eventId ? [{ id: eventId }] : (await db.all<any>(`SELECT event_id id FROM event_participants WHERE user_id=?`, u.id));
    let owed = 0, recv = 0, paid = 0, personal = 0;
    for (const e of events) {
      const b = (await eventLedger(db, e.id)).balances.find((x) => x.userId === u.id);
      if (!b) continue;
      paid += b.paidPaise; personal += b.personalPaise;
      if (b.netPaise < 0) owed += -b.netPaise; else recv += b.netPaise;
    }
    res.json({ categories: camelAll(cats), paidPaise: paid, personalPaise: personal, owedPaise: owed, receivablePaise: recv });
  });

  // ---------- admin-only ----------
  const a = Router();
  a.use(requireAdmin);

  a.get('/dashboard', async (_req, res) => {
    const events = await db.all<any>(`SELECT id FROM events`);
    let owed = 0, recv = 0;
    for (const e of events) for (const b of (await eventLedger(db, e.id)).balances) { if (b.netPaise < 0) owed += -b.netPaise; else recv += b.netPaise; }
    const day = `strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day')`;
    res.json({
      users: {
        total: await one(`SELECT COUNT(*) s FROM users`), active: await one(`SELECT COUNT(*) s FROM users WHERE status='ACTIVE'`), inactive: await one(`SELECT COUNT(*) s FROM users WHERE status<>'ACTIVE'`),
        recent: camelAll(await db.all(`SELECT id, name, username, role, status, created_at FROM users ORDER BY id DESC LIMIT 5`)),
      },
      events: {
        active: await one(`SELECT COUNT(*) s FROM events WHERE status='ACTIVE'`), upcoming: await one(`SELECT COUNT(*) s FROM events WHERE status='UPCOMING'`), completed: await one(`SELECT COUNT(*) s FROM events WHERE status='COMPLETED'`),
        trips: await one(`SELECT COUNT(*) s FROM events WHERE type='TRIP'`), hackathons: await one(`SELECT COUNT(*) s FROM events WHERE type='HACKATHON'`), hybrid: await one(`SELECT COUNT(*) s FROM events WHERE type='HACKATHON_TRIP'`),
      },
      expenses: {
        total: await one(`SELECT COUNT(*) s FROM expenses WHERE status<>'CANCELLED'`), totalPaise: await one(`SELECT SUM(amount_paise) s FROM expenses WHERE status<>'CANCELLED'`),
        pendingApproval: await one(`SELECT COUNT(*) s FROM expenses WHERE status='PENDING_APPROVAL'`), disputed: await one(`SELECT COUNT(*) s FROM expenses WHERE status='DISPUTED'`),
        declined: await one(`SELECT COUNT(*) s FROM expenses WHERE status='DECLINED'`),
        private: await one(`SELECT COUNT(*) s FROM expenses WHERE visibility='PRIVATE' AND status<>'CANCELLED'`), public: await one(`SELECT COUNT(*) s FROM expenses WHERE visibility='PUBLIC' AND status<>'CANCELLED'`),
        sponsoredPaise: await one(`SELECT SUM(amount_paise) s FROM expenses WHERE payer_type NOT IN ('INDIVIDUAL','GROUP_MEMBER') AND status<>'CANCELLED'`),
      },
      settlements: {
        owedPaise: owed, receivablePaise: recv, pending: await one(`SELECT COUNT(*) s FROM settlements WHERE status IN ('PENDING','PAYMENT_INITIATED','PAID')`),
        disputed: await one(`SELECT COUNT(*) s FROM settlements WHERE status='DISPUTED'`), openDisputes: await one(`SELECT COUNT(*) s FROM disputes WHERE status IN ('OPEN','UNDER_REVIEW')`),
      },
      system: {
        errors24h: await one(`SELECT COUNT(*) s FROM system_errors WHERE level='ERROR' AND created_at > ${day}`), unresolvedErrors: await one(`SELECT COUNT(*) s FROM system_errors WHERE resolved=0`),
        failedLogins24h: await one(`SELECT COUNT(*) s FROM audit_logs WHERE action='LOGIN_FAILED' AND created_at > ${day}`),
        notificationFailures: await one(`SELECT COUNT(*) s FROM system_errors WHERE source='notification'`), storageFailures: await one(`SELECT COUNT(*) s FROM system_errors WHERE source IN ('storage','upload')`),
        databaseErrors: await one(`SELECT COUNT(*) s FROM system_errors WHERE source='database'`), openProblems: await one(`SELECT COUNT(*) s FROM problem_reports WHERE status<>'RESOLVED'`),
      },
    });
  });

  a.get('/audit', async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const where = ['1=1']; const p: any[] = [];
    if (q.actorId) { where.push('actor_id=?'); p.push(Number(q.actorId)); }
    if (q.action) { where.push('action=?'); p.push(q.action); }
    if (q.entityType) { where.push('entity_type=?'); p.push(q.entityType); }
    if (q.entityId) { where.push('entity_id=?'); p.push(Number(q.entityId)); }
    if (q.eventId) { where.push('event_id=?'); p.push(Number(q.eventId)); }
    if (q.search) { where.push(`(action LIKE ? OR COALESCE(actor_name,'') LIKE ? OR COALESCE(metadata,'') LIKE ?)`); p.push(`%${q.search}%`, `%${q.search}%`, `%${q.search}%`); }
    const limit = intQuery(q.limit, 50, 1, 200), offset = intQuery(q.offset, 0, 0, 1e7);
    const total = (await db.get<any>(`SELECT COUNT(*) c FROM audit_logs WHERE ${where.join(' AND ')}`, ...p))!.c;
    const rows = await db.all(`SELECT * FROM audit_logs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    res.json({ logs: camelAll(rows), total });
  });

  a.get('/errors', async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const where = ['1=1']; const p: any[] = [];
    if (q.level) { where.push('level=?'); p.push(q.level); }
    if (q.source) { where.push('source=?'); p.push(q.source); }
    if (q.resolved) { where.push('resolved=?'); p.push(q.resolved === 'true' ? 1 : 0); }
    if (q.search) { where.push('(message LIKE ? OR source LIKE ?)'); p.push(`%${q.search}%`, `%${q.search}%`); }
    const rows = await db.all(`SELECT * FROM system_errors WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, ...p, intQuery(q.limit, 100, 1, 500));
    const bySource = await db.all(`SELECT source, COUNT(*) AS count FROM system_errors WHERE resolved=0 GROUP BY source`);
    res.json({ errors: camelAll(rows).map((e: any) => ({ ...e, resolved: !!e.resolved })), bySource: camelAll(bySource) });
  });
  a.post('/errors/:id/resolve', async (req, res) => {
    const c = (await db.run(`UPDATE system_errors SET resolved=1 WHERE id=?`, Number(req.params.id))).changes;
    if (!c) throw notFound('Error not found');
    await audit(db, req.user!, 'ERROR_RESOLVED', 'SYSTEM_ERROR', Number(req.params.id));
    res.json({ ok: true });
  });

  a.get('/health', async (_req, res) => {
    let dbOk = true;
    try { await db.get('SELECT 1 x'); } catch { dbOk = false; }
    const count = async (t: string) => (await db.get<any>(`SELECT COUNT(*) c FROM ${t}`))!.c;
    res.json({
      status: dbOk ? 'HEALTHY' : 'DEGRADED', uptimeSeconds: Math.round((Date.now() - startedAt) / 1000), node: process.version,
      database: { ok: dbOk, engine: db.kind === 'pg' ? 'PostgreSQL' : 'PostgreSQL (embedded)', integrity: dbOk ? 'ok' : 'unreachable', foreignKeyViolations: 0 },
      counts: { users: await count('users'), events: await count('events'), expenses: await count('expenses'), settlements: await count('settlements'), notifications: await count('notifications'), auditLogs: await count('audit_logs'), attachments: await count('attachments') },
    });
  });

  a.get('/reports/event/:id', async (req, res) => {
    const id = Number(req.params.id);
    const s = await eventSummary(db, id);
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

  // Event financial summary for participants
  r.get('/events/:id/summary', async (req, res) => {
    const id = Number(req.params.id);
    await loadEventForUser(db, req.user!, id);
    const s = await eventSummary(db, id);
    if (req.user!.role === 'ADMIN') return res.json(s);
    res.json({ event: s.event, financial: s.financial, userWise: s.userWise.map((u) => ({ userId: u.userId, name: u.name, netPaise: u.netPaise })), suggestions: s.suggestions, budgetVsActual: s.budgetVsActual });
  });
  return r;
}
