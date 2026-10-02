import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db.js';
import { requireAuth } from '../auth.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../errors.js';
import { audit, notify, notifyAdmins, camel, camelAll } from '../helpers.js';
import { parse, optStr, paise, PAYMENT_METHODS, intQuery } from '../validate.js';
import { loadEventForUser, getEventRow, isActiveMember, membership, canAccessAttachment } from '../access.js';
import { eventLedger, inFlight } from '../services/ledger.js';
import { formatINR } from '../engine/money.js';

const SETTLEMENT_STATES = new Set(['ACTIVE', 'COMPLETED']);

function settlementView(db: DB, id: number) {
  const s = db.prepare(
    `SELECT s.*, f.name from_name, t.name to_name, ev.name event_name FROM settlements s JOIN users f ON f.id=s.from_user_id JOIN users t ON t.id=s.to_user_id JOIN events ev ON ev.id=s.event_id WHERE s.id=?`,
  ).get(id) as any;
  if (!s) throw notFound('Settlement not found');
  const attachments = db.prepare(`SELECT id, original_name, mime, size, kind FROM attachments WHERE entity_type='SETTLEMENT' AND entity_id=?`).all(id);
  return { ...camel(s), attachments: camelAll(attachments) };
}

/** When every balance in an event is zero and nothing is pending, mark approved expenses as SETTLED. */
function settleExpensesIfClear(db: DB, eventId: number, actorId: number) {
  const l = eventLedger(db, eventId);
  if (l.balances.every((b) => b.netPaise === 0) && l.totals.pendingPaise === 0 && l.totals.groupPaise > 0) {
    const n = db.prepare(`UPDATE expenses SET status='SETTLED' WHERE event_id=? AND status='APPROVED' AND category<>'PERSONAL' AND payer_type IN ('INDIVIDUAL','GROUP_MEMBER')`).run(eventId).changes;
    if (n) audit(db, null, 'EVENT_SETTLED', 'EVENT', eventId, { eventId, metadata: { expensesMarkedSettled: n, triggeredBy: actorId } });
  }
}

export function settlementsRouter(db: DB) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/events/:id/settlement', (req, res) => {
    const id = Number(req.params.id);
    const ev = loadEventForUser(db, req.user!, id);
    const l = eventLedger(db, id);
    const names = new Map((db.prepare(`SELECT id, name FROM users`).all() as any[]).map((u) => [u.id, u.name]));
    const payments = db.prepare(`SELECT id FROM settlements WHERE event_id=? ORDER BY id DESC`).all(id).map((p: any) => settlementView(db, p.id));
    const me = l.balances.find((b) => b.userId === req.user!.id);
    res.json({
      eventId: id, eventStatus: ev.status, totals: l.totals,
      balances: l.balances.map((b) => ({ ...b, name: names.get(b.userId) })),
      suggestions: l.suggestions.map((s) => ({ ...s, fromName: names.get(s.fromUserId), toName: names.get(s.toUserId) })),
      payments, myNetPaise: me?.netPaise ?? 0,
    });
  });

  r.get('/settlements', (req, res) => {
    const u = req.user!;
    const eventId = req.query.eventId ? Number(req.query.eventId) : null;
    const status = req.query.status ? String(req.query.status) : null;
    const limit = intQuery(req.query.limit, 50, 1, 200), offset = intQuery(req.query.offset, 0, 0, 1e6);
    const rows = db.prepare(
      `SELECT s.id FROM settlements s WHERE (?=1 OR s.from_user_id=? OR s.to_user_id=?) AND (? IS NULL OR s.event_id=?) AND (? IS NULL OR s.status=?) ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    ).all(u.role === 'ADMIN' ? 1 : 0, u.id, u.id, eventId, eventId, status, status, limit, offset) as any[];
    res.json({ settlements: rows.map((x) => settlementView(db, x.id)) });
  });

  r.post('/settlements', (req, res) => {
    const u = req.user!;
    const d = parse(z.object({
      eventId: z.number().int().positive(), toUserId: z.number().int().positive(), fromUserId: z.number().int().positive().optional(),
      amountPaise: paise, method: z.enum(PAYMENT_METHODS).optional().nullable(), note: optStr(500), idempotencyKey: z.string().min(8).max(100).optional(),
    }), req.body);
    if (d.idempotencyKey) {
      const ex = db.prepare(`SELECT id, created_by FROM settlements WHERE idempotency_key=?`).get(d.idempotencyKey) as any;
      if (ex) {
        if (ex.created_by !== u.id) throw conflict('Idempotency key already used');
        return res.json({ settlement: settlementView(db, ex.id), duplicate: true });
      }
    }
    const ev = loadEventForUser(db, u, d.eventId);
    const isAdmin = u.role === 'ADMIN';
    if (!isAdmin && !SETTLEMENT_STATES.has(ev.status)) throw new AppError(409, `Settlements are not available while the event is ${ev.status.toLowerCase()}`, 'EVENT_STATE');
    const from = isAdmin ? d.fromUserId ?? u.id : u.id;
    if (!isAdmin && d.fromUserId && d.fromUserId !== u.id) throw forbidden('You can only record payments you made');
    if (from === d.toUserId) throw badRequest('You cannot pay yourself');
    if (!isAdmin && !isActiveMember(db, d.eventId, u.id)) throw forbidden('You are not an active participant of this event');
    if (membership(db, d.eventId, d.toUserId) === null || membership(db, d.eventId, from) === null) throw badRequest('Both people must be participants of this event');

    const l = eventLedger(db, d.eventId);
    const fl = inFlight(db, d.eventId);
    const net = (uid: number) => l.balances.find((b) => b.userId === uid)?.netPaise ?? 0;
    const canPay = -net(from) - (fl.out.get(from) ?? 0);
    const canReceive = net(d.toUserId) - (fl.inc.get(d.toUserId) ?? 0);
    if (d.amountPaise > canPay) throw badRequest(`Amount exceeds what ${isAdmin ? 'this user owes' : 'you owe'} (${formatINR(Math.max(0, canPay))} available)`);
    if (d.amountPaise > canReceive) throw badRequest(`Amount exceeds what the receiver is owed (${formatINR(Math.max(0, canReceive))} available)`);

    const status = isAdmin && from !== u.id ? 'PENDING' : 'PAID';
    const id = db.transaction(() => {
      const info = db.prepare(
        `INSERT INTO settlements (event_id,from_user_id,to_user_id,amount_paise,method,status,note,idempotency_key,created_by,paid_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).run(d.eventId, from, d.toUserId, d.amountPaise, d.method ?? null, status, d.note ?? null, d.idempotencyKey ?? null, u.id, status === 'PAID' ? new Date().toISOString() : null);
      const sid = Number(info.lastInsertRowid);
      audit(db, u, 'SETTLEMENT_CREATED', 'SETTLEMENT', sid, { eventId: d.eventId, next: { from, to: d.toUserId, amountPaise: d.amountPaise, status } });
      if (status === 'PAID') {
        notify(db, [d.toUserId], { type: 'SETTLEMENT_PAID', level: 'ACTION_REQUIRED', title: `${u.name} says they paid you ${formatINR(d.amountPaise)}`, body: `${ev.name}. Please confirm once received.`, entityType: 'SETTLEMENT', entityId: sid, eventId: d.eventId });
      } else {
        notify(db, [from], { type: 'SETTLEMENT_CREATED', level: 'ACTION_REQUIRED', title: `Please pay ${formatINR(d.amountPaise)}`, body: `Requested by admin in ${ev.name}.`, entityType: 'SETTLEMENT', entityId: sid, eventId: d.eventId });
        notify(db, [d.toUserId], { type: 'SETTLEMENT_CREATED', title: `Settlement scheduled: ${formatINR(d.amountPaise)} to you`, entityType: 'SETTLEMENT', entityId: sid, eventId: d.eventId });
      }
      notifyAdmins(db, { type: 'SETTLEMENT_CREATED', title: `Settlement ${formatINR(d.amountPaise)} recorded`, body: ev.name, entityType: 'SETTLEMENT', entityId: sid, eventId: d.eventId }, u.id);
      return sid;
    })();
    res.status(201).json({ settlement: settlementView(db, id), duplicate: false });
  });

  const load = (req: any) => {
    const s = db.prepare(`SELECT * FROM settlements WHERE id=?`).get(Number(req.params.id)) as any;
    if (!s) throw notFound('Settlement not found');
    const u = req.user!;
    if (u.role !== 'ADMIN' && s.from_user_id !== u.id && s.to_user_id !== u.id) throw notFound('Settlement not found');
    return s;
  };

  // Payer marks an admin-requested (PENDING) settlement as paid
  r.post('/settlements/:id/pay', (req, res) => {
    const s = load(req);
    if (s.from_user_id !== req.user!.id) throw forbidden('Only the payer can mark this as paid');
    if (s.status === 'PAID') return res.json({ settlement: settlementView(db, s.id) });
    if (!['PENDING', 'PAYMENT_INITIATED'].includes(s.status)) throw new AppError(409, `Cannot mark a ${s.status.toLowerCase()} settlement as paid`, 'SETTLEMENT_STATE');
    const d = parse(z.object({ method: z.enum(PAYMENT_METHODS).optional() }), req.body ?? {});
    db.transaction(() => {
      db.prepare(`UPDATE settlements SET status='PAID', method=COALESCE(?,method), paid_at=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(d.method ?? null, new Date().toISOString(), s.id);
      audit(db, req.user!, 'SETTLEMENT_PAID', 'SETTLEMENT', s.id, { eventId: s.event_id, previous: { status: s.status }, next: { status: 'PAID' } });
      notify(db, [s.to_user_id], { type: 'SETTLEMENT_PAID', level: 'ACTION_REQUIRED', title: `${req.user!.name} says they paid you ${formatINR(s.amount_paise)}`, body: 'Please confirm once received.', entityType: 'SETTLEMENT', entityId: s.id, eventId: s.event_id });
    })();
    res.json({ settlement: settlementView(db, s.id) });
  });

  r.post('/settlements/:id/confirm', (req, res) => {
    const s = load(req);
    if (s.to_user_id !== req.user!.id && req.user!.role !== 'ADMIN') throw forbidden('Only the receiver (or an admin) can confirm a payment');
    if (s.status === 'CONFIRMED') return res.json({ settlement: settlementView(db, s.id), duplicate: true }); // duplicate confirmation is a no-op
    if (!['PAID', 'PAYMENT_INITIATED', 'DISPUTED'].includes(s.status) && !(req.user!.role === 'ADMIN' && s.status === 'PENDING')) {
      throw new AppError(409, `Cannot confirm a ${s.status.toLowerCase()} settlement`, 'SETTLEMENT_STATE');
    }
    db.transaction(() => {
      // guard against racing duplicate confirms
      const upd = db.prepare(`UPDATE settlements SET status='CONFIRMED', confirmed_at=?, confirmed_by=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status<>'CONFIRMED'`)
        .run(new Date().toISOString(), req.user!.id, s.id);
      if (!upd.changes) return;
      audit(db, req.user!, 'SETTLEMENT_CONFIRMED', 'SETTLEMENT', s.id, { eventId: s.event_id, previous: { status: s.status }, next: { status: 'CONFIRMED' }, metadata: { amountPaise: s.amount_paise } });
      notify(db, [s.from_user_id, s.to_user_id].filter((x) => x !== req.user!.id), { type: 'SETTLEMENT_CONFIRMED', level: 'SUCCESS', title: `Payment of ${formatINR(s.amount_paise)} confirmed`, entityType: 'SETTLEMENT', entityId: s.id, eventId: s.event_id });
      notifyAdmins(db, { type: 'SETTLEMENT_CONFIRMED', title: `Settlement ${formatINR(s.amount_paise)} confirmed`, entityType: 'SETTLEMENT', entityId: s.id, eventId: s.event_id }, req.user!.id);
      settleExpensesIfClear(db, s.event_id, req.user!.id);
    })();
    res.json({ settlement: settlementView(db, s.id), duplicate: false });
  });

  r.post('/settlements/:id/dispute', (req, res) => {
    const s = load(req);
    if (s.to_user_id !== req.user!.id) throw forbidden('Only the receiver can dispute a payment');
    if (!['PAID', 'PAYMENT_INITIATED'].includes(s.status)) throw new AppError(409, `Cannot dispute a ${s.status.toLowerCase()} settlement`, 'SETTLEMENT_STATE');
    const d = parse(z.object({ note: z.string().trim().min(3).max(500) }), req.body);
    db.transaction(() => {
      db.prepare(`UPDATE settlements SET status='DISPUTED', note=COALESCE(note || ' | ', '') || ?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(`Disputed: ${d.note}`, s.id);
      audit(db, req.user!, 'SETTLEMENT_DISPUTED', 'SETTLEMENT', s.id, { eventId: s.event_id, metadata: { note: d.note } });
      notify(db, [s.from_user_id], { type: 'SETTLEMENT_DISPUTED', level: 'WARNING', title: `${req.user!.name} did not receive your ${formatINR(s.amount_paise)} payment`, body: d.note, entityType: 'SETTLEMENT', entityId: s.id, eventId: s.event_id });
      notifyAdmins(db, { type: 'SETTLEMENT_DISPUTED', level: 'ACTION_REQUIRED', title: 'Settlement disputed', body: d.note, entityType: 'SETTLEMENT', entityId: s.id, eventId: s.event_id });
    })();
    res.json({ settlement: settlementView(db, s.id) });
  });

  r.post('/settlements/:id/cancel', (req, res) => {
    const s = load(req);
    if (req.user!.role !== 'ADMIN' && s.created_by !== req.user!.id) throw forbidden('Only the creator or an admin can cancel this');
    if (s.status === 'CANCELLED') return res.json({ settlement: settlementView(db, s.id) });
    if (s.status === 'CONFIRMED') throw new AppError(409, 'A confirmed payment cannot be cancelled; ask an admin to correct it.', 'SETTLEMENT_STATE');
    db.transaction(() => {
      db.prepare(`UPDATE settlements SET status='CANCELLED', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(s.id);
      audit(db, req.user!, 'SETTLEMENT_CANCELLED', 'SETTLEMENT', s.id, { eventId: s.event_id, previous: { status: s.status } });
      notify(db, [s.from_user_id, s.to_user_id].filter((x) => x !== req.user!.id), { type: 'SETTLEMENT_CANCELLED', title: `Payment of ${formatINR(s.amount_paise)} was cancelled`, entityType: 'SETTLEMENT', entityId: s.id, eventId: s.event_id });
    })();
    res.json({ settlement: settlementView(db, s.id) });
  });

  r.post('/settlements/:id/admin-override', (req, res) => {
    if (req.user!.role !== 'ADMIN') throw forbidden('Admin access required');
    const s = load(req);
    const d = parse(z.object({
      status: z.enum(['PENDING', 'PAYMENT_INITIATED', 'PAID', 'CONFIRMED', 'DISPUTED', 'CANCELLED']).optional(), amountPaise: paise.optional(), adminNote: z.string().trim().min(3).max(500),
    }), req.body);
    db.transaction(() => {
      db.prepare(`UPDATE settlements SET status=COALESCE(?,status), amount_paise=COALESCE(?,amount_paise), admin_note=?, confirmed_by=CASE WHEN ?='CONFIRMED' THEN ? ELSE confirmed_by END,
                  confirmed_at=CASE WHEN ?='CONFIRMED' AND confirmed_at IS NULL THEN ? ELSE confirmed_at END, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
        .run(d.status ?? null, d.amountPaise ?? null, d.adminNote, d.status ?? '', req.user!.id, d.status ?? '', new Date().toISOString(), s.id);
      audit(db, req.user!, 'ADMIN_OVERRIDE', 'SETTLEMENT', s.id, { eventId: s.event_id, previous: { status: s.status, amountPaise: s.amount_paise }, next: { status: d.status ?? s.status, amountPaise: d.amountPaise ?? s.amount_paise }, metadata: { reason: d.adminNote } });
      notify(db, [s.from_user_id, s.to_user_id], { type: 'ADMIN_OVERRIDE', level: 'WARNING', title: 'An admin corrected a settlement', body: d.adminNote, entityType: 'SETTLEMENT', entityId: s.id, eventId: s.event_id });
    })();
    res.json({ settlement: settlementView(db, s.id) });
  });

  return r;
}
