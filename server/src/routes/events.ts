import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db.js';
import { requireAuth, requireAdmin } from '../auth.js';
import { AppError, badRequest, forbidden, notFound } from '../errors.js';
import { audit, notify, notifyAdmins, camel, camelAll } from '../helpers.js';
import { parse, optStr, isoDate, EVENT_STATUSES, EVENT_TYPES, CATEGORIES, intQuery } from '../validate.js';
import { getEventRow, loadEventForUser, requireActiveMember, expenseVisibilitySql, getExpenseForUser } from '../access.js';
import { eventLedger } from '../services/ledger.js';

const hackathonSchema = z.object({
  hackathonName: optStr(200), hostOrg: optStr(200), hostCollege: optStr(200), venue: optStr(200), city: optStr(100), state: optStr(100),
  startsAt: optStr(40), endsAt: optStr(40), registrationStatus: optStr(100), registrationDeadline: optStr(40), participationType: optStr(100),
  mode: z.enum(['ONLINE', 'OFFLINE', 'HYBRID']).optional().nullable(), collegeApproved: z.boolean().optional().nullable(), approvalStatus: optStr(100),
  independent: z.boolean().optional().nullable(), teamName: optStr(120), teamMembers: optStr(1000), registrationDetails: optStr(1000),
  requiredDocuments: optStr(1000), accommodation: optStr(500), food: optStr(500), transport: optStr(500), eventUrl: optStr(500), notes: optStr(1000),
}).strict();
const tripSchema = z.object({
  intermediateLocations: optStr(1000), returnDestination: optStr(200), accommodation: optStr(500), food: optStr(500), tickets: optStr(500), notes: optStr(1000),
}).strict();
const itinerarySchema = z.array(z.object({
  day: z.number().int().min(1).max(60), time: optStr(20), title: z.string().trim().min(1).max(200), description: optStr(1000), location: optStr(200),
  kind: z.enum(['TRAVEL', 'HACKATHON', 'TOURISM', 'STAY', 'OTHER']).default('OTHER'),
})).max(200);
const budgetSchema = z.partialRecord(z.enum(CATEGORIES),z.number().int().min(0).max(1e10));

const eventBase = {
  name: z.string().trim().min(1).max(200), type: z.enum(EVENT_TYPES), description: optStr(2000),
  startDate: isoDate, endDate: isoDate, status: z.enum(EVENT_STATUSES),
  destination: optStr(200), startLocation: optStr(200), organizer: optStr(200), college: optStr(200), notes: optStr(2000),
  visibility: z.enum(['PARTICIPANTS', 'ADMIN_ONLY']),
};
const createSchema = z.object({
  ...eventBase, status: eventBase.status.default('UPCOMING'), visibility: eventBase.visibility.default('PARTICIPANTS'),
  participantIds: z.array(z.number().int().positive()).max(500).default([]),
  hackathon: hackathonSchema.optional(), trip: tripSchema.optional(), itinerary: itinerarySchema.optional(), budgets: budgetSchema.optional(),
  checklist: z.array(z.object({ title: z.string().trim().min(1).max(200), userId: z.number().int().positive().optional() })).max(100).optional(),
});
const updateSchema = z.object({
  ...Object.fromEntries(Object.entries(eventBase).map(([k, v]) => [k, v.optional()])) as { [K in keyof typeof eventBase]: z.ZodOptional<(typeof eventBase)[K]> },
  hackathon: hackathonSchema.partial().optional(), trip: tripSchema.partial().optional(), itinerary: itinerarySchema.optional(), budgets: budgetSchema.optional(),
  reason: optStr(500),
});

const HACK_COLS: Record<string, string> = {
  hackathonName: 'hackathon_name', hostOrg: 'host_org', hostCollege: 'host_college', venue: 'venue', city: 'city', state: 'state', startsAt: 'starts_at', endsAt: 'ends_at',
  registrationStatus: 'registration_status', registrationDeadline: 'registration_deadline', participationType: 'participation_type', mode: 'mode',
  collegeApproved: 'college_approved', approvalStatus: 'approval_status', independent: 'independent', teamName: 'team_name', teamMembers: 'team_members',
  registrationDetails: 'registration_details', requiredDocuments: 'required_documents', accommodation: 'accommodation', food: 'food', transport: 'transport', eventUrl: 'event_url', notes: 'notes',
};
const TRIP_COLS: Record<string, string> = {
  intermediateLocations: 'intermediate_locations', returnDestination: 'return_destination', accommodation: 'accommodation', food: 'food', tickets: 'tickets', notes: 'notes',
};
const bool = (v: any) => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

function upsertDetails(db: DB, table: string, cols: Record<string, string>, eventId: number, data: Record<string, any> | undefined) {
  if (!data) return;
  const keys = Object.keys(data).filter((k) => cols[k]);
  db.prepare(`INSERT OR IGNORE INTO ${table} (event_id) VALUES (?)`).run(eventId);
  if (!keys.length) return;
  db.prepare(`UPDATE ${table} SET ${keys.map((k) => `${cols[k]}=?`).join(',')} WHERE event_id=?`).run(...keys.map((k) => bool(data[k]) ?? null), eventId);
}

function replaceItinerary(db: DB, eventId: number, items: z.infer<typeof itinerarySchema>) {
  db.prepare(`DELETE FROM itinerary_items WHERE event_id=?`).run(eventId);
  const ins = db.prepare(`INSERT INTO itinerary_items (event_id, day, time, title, description, location, kind) VALUES (?,?,?,?,?,?,?)`);
  for (const i of items) ins.run(eventId, i.day, i.time ?? null, i.title, i.description ?? null, i.location ?? null, i.kind);
}
function replaceBudgets(db: DB, eventId: number, b: Record<string, number>) {
  db.prepare(`DELETE FROM event_budgets WHERE event_id=?`).run(eventId);
  const ins = db.prepare(`INSERT INTO event_budgets (event_id, category, amount_paise) VALUES (?,?,?)`);
  for (const [c, a] of Object.entries(b)) ins.run(eventId, c, a);
}

function activeUsersOnly(db: DB, ids: number[]) {
  for (const id of ids) {
    const u = db.prepare(`SELECT status FROM users WHERE id=?`).get(id) as any;
    if (!u) throw badRequest(`User ${id} does not exist`);
    if (u.status !== 'ACTIVE') throw badRequest(`User ${id} is not active`);
  }
}

export function eventDetail(db: DB, user: { id: number; role: string }, eventId: number) {
  const ev = getEventRow(db, eventId);
  const isAdmin = user.role === 'ADMIN';
  const participants = db.prepare(
    `SELECT u.id, u.name, u.username, u.college, u.department, u.year, u.avatar_attachment_id, ep.status, ep.added_at
     FROM event_participants ep JOIN users u ON u.id=ep.user_id WHERE ep.event_id=? ORDER BY u.name`,
  ).all(eventId);
  const checklist = db.prepare(
    `SELECT c.*, u.name user_name FROM checklist_items c LEFT JOIN users u ON u.id=c.user_id WHERE c.event_id=? AND (?=1 OR c.user_id IS NULL OR c.user_id=?) ORDER BY c.id`,
  ).all(eventId, isAdmin ? 1 : 0, user.id);
  const vis = expenseVisibilitySql(user as any);
  const actual = db.prepare(
    `SELECT e.category, SUM(e.amount_paise) s FROM expenses e WHERE e.event_id=? AND e.status<>'CANCELLED' AND ${vis.sql} GROUP BY e.category`,
  ).all(eventId, ...vis.params) as any[];
  const budgets = db.prepare(`SELECT category, amount_paise FROM event_budgets WHERE event_id=?`).all(eventId) as any[];
  const cats = new Set([...budgets.map((b) => b.category), ...actual.map((a) => a.category)]);
  return {
    ...camel(ev),
    hackathon: camel(db.prepare(`SELECT * FROM hackathon_details WHERE event_id=?`).get(eventId)) ?? null,
    trip: camel(db.prepare(`SELECT * FROM trip_details WHERE event_id=?`).get(eventId)) ?? null,
    itinerary: camelAll(db.prepare(`SELECT * FROM itinerary_items WHERE event_id=? ORDER BY day, time`).all(eventId)),
    budget: [...cats].map((c) => ({
      category: c, budgetPaise: budgets.find((b) => b.category === c)?.amount_paise ?? 0, actualPaise: actual.find((a) => a.category === c)?.s ?? 0,
    })),
    participants: camelAll(participants),
    checklist: camelAll(checklist).map((c: any) => ({ ...c, done: !!c.done })),
    myMembership: isAdmin ? 'ADMIN' : (db.prepare(`SELECT status FROM event_participants WHERE event_id=? AND user_id=?`).get(eventId, user.id) as any)?.status ?? null,
  };
}

export function eventsRouter(db: DB) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/', (req, res) => {
    const u = req.user!;
    const q = `%${String(req.query.search ?? '').trim()}%`;
    const status = req.query.status ? String(req.query.status) : null;
    const type = req.query.type ? String(req.query.type) : null;
    const limit = intQuery(req.query.limit, 100, 1, 200), offset = intQuery(req.query.offset, 0, 0, 1e6);
    const rows = (u.role === 'ADMIN'
      ? db.prepare(`SELECT e.*, (SELECT COUNT(*) FROM event_participants p WHERE p.event_id=e.id AND p.status='ACTIVE') participant_count FROM events e WHERE (e.name LIKE ? OR e.destination LIKE ?) AND (? IS NULL OR e.status=?) AND (? IS NULL OR e.type=?) ORDER BY e.start_date DESC LIMIT ? OFFSET ?`)
          .all(q, q, status, status, type, type, limit, offset)
      : db.prepare(`SELECT e.*, (SELECT COUNT(*) FROM event_participants p WHERE p.event_id=e.id AND p.status='ACTIVE') participant_count FROM events e JOIN event_participants me ON me.event_id=e.id AND me.user_id=?
                    WHERE e.visibility='PARTICIPANTS' AND (e.name LIKE ? OR e.destination LIKE ?) AND (? IS NULL OR e.status=?) AND (? IS NULL OR e.type=?) ORDER BY e.start_date DESC LIMIT ? OFFSET ?`)
          .all(u.id, q, q, status, status, type, type, limit, offset)) as any[];
    const events = rows.map((e) => {
      const out: any = camel(e);
      if (u.role !== 'ADMIN') {
        const mine = eventLedger(db, e.id).balances.find((b) => b.userId === u.id);
        out.myNetPaise = mine?.netPaise ?? 0;
      }
      return out;
    });
    res.json({ events });
  });

  r.post('/', requireAdmin, (req, res) => {
    const d = parse(createSchema, req.body);
    if (d.endDate < d.startDate) throw badRequest('End date must be on or after the start date');
    activeUsersOnly(db, d.participantIds);
    const id = db.transaction(() => {
      const info = db.prepare(
        `INSERT INTO events (name,type,description,start_date,end_date,status,destination,start_location,organizer,college,notes,visibility,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(d.name, d.type, d.description ?? null, d.startDate, d.endDate, d.status, d.destination ?? null, d.startLocation ?? null, d.organizer ?? null, d.college ?? null, d.notes ?? null, d.visibility, req.user!.id);
      const eid = Number(info.lastInsertRowid);
      if (d.type !== 'TRIP') upsertDetails(db, 'hackathon_details', HACK_COLS, eid, d.hackathon ?? {});
      if (d.type !== 'HACKATHON') upsertDetails(db, 'trip_details', TRIP_COLS, eid, d.trip ?? {});
      if (d.itinerary) replaceItinerary(db, eid, d.itinerary);
      if (d.budgets) replaceBudgets(db, eid, d.budgets);
      const insP = db.prepare(`INSERT OR IGNORE INTO event_participants (event_id,user_id,added_by) VALUES (?,?,?)`);
      for (const uid of new Set(d.participantIds)) insP.run(eid, uid, req.user!.id);
      for (const c of d.checklist ?? []) db.prepare(`INSERT INTO checklist_items (event_id,title,user_id) VALUES (?,?,?)`).run(eid, c.title, c.userId ?? null);
      audit(db, req.user!, 'EVENT_CREATED', 'EVENT', eid, { eventId: eid, next: { name: d.name, type: d.type, startDate: d.startDate, endDate: d.endDate, participants: d.participantIds } });
      notify(db, d.participantIds, { type: 'EVENT_ADDED', level: 'INFO', title: `You were added to "${d.name}"`, body: `${d.startDate.slice(0, 10)} → ${d.endDate.slice(0, 10)}${d.destination ? ' · ' + d.destination : ''}`, entityType: 'EVENT', entityId: eid, eventId: eid });
      notifyAdmins(db, { type: 'EVENT_CREATED', title: `New event: ${d.name}`, body: `by ${req.user!.name}`, entityType: 'EVENT', entityId: eid, eventId: eid }, req.user!.id);
      return eid;
    })();
    res.status(201).json({ event: eventDetail(db, req.user!, id) });
  });

  r.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    loadEventForUser(db, req.user!, id);
    res.json({ event: eventDetail(db, req.user!, id) });
  });

  r.patch('/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const d = parse(updateSchema, req.body);
    const cur = getEventRow(db, id);
    const nextStart = d.startDate ?? cur.start_date, nextEnd = d.endDate ?? cur.end_date;
    if (nextEnd < nextStart) throw badRequest('End date must be on or after the start date');
    const before = eventDetail(db, req.user!, id);
    const important = (d.startDate && d.startDate !== cur.start_date) || (d.endDate && d.endDate !== cur.end_date) || (d.status && d.status !== cur.status) || (d.destination !== undefined && d.destination !== cur.destination);
    db.transaction(() => {
      const map: Record<string, any> = {
        name: d.name, type: d.type, description: d.description, start_date: d.startDate, end_date: d.endDate, status: d.status, destination: d.destination,
        start_location: d.startLocation, organizer: d.organizer, college: d.college, notes: d.notes, visibility: d.visibility,
      };
      const keys = Object.keys(map).filter((k) => map[k] !== undefined);
      if (keys.length) db.prepare(`UPDATE events SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(...keys.map((k) => map[k]), id);
      const type = d.type ?? cur.type;
      if (d.hackathon && type !== 'TRIP') upsertDetails(db, 'hackathon_details', HACK_COLS, id, d.hackathon);
      if (d.trip && type !== 'HACKATHON') upsertDetails(db, 'trip_details', TRIP_COLS, id, d.trip);
      if (d.itinerary) replaceItinerary(db, id, d.itinerary);
      if (d.budgets) replaceBudgets(db, id, d.budgets);
      const after = eventDetail(db, req.user!, id);
      const extended = d.endDate && d.endDate > cur.end_date;
      audit(db, req.user!, extended ? 'EVENT_EXTENDED' : d.status && d.status !== cur.status ? 'EVENT_STATUS_CHANGED' : 'EVENT_UPDATED', 'EVENT', id, {
        eventId: id, previous: before, next: after, metadata: { reason: d.reason ?? null, changed: Object.keys(d) },
      });
      const people = (db.prepare(`SELECT user_id FROM event_participants WHERE event_id=? AND status='ACTIVE'`).all(id) as any[]).map((p) => p.user_id);
      notify(db, people, {
        type: important ? 'EVENT_IMPORTANT_CHANGE' : 'EVENT_UPDATED', level: important ? 'WARNING' : 'INFO',
        title: `${after.name} was updated`, body: extended ? `End date extended to ${d.endDate!.slice(0, 10)}.` : d.status && d.status !== cur.status ? `Status is now ${d.status}.` : d.reason ?? undefined,
        entityType: 'EVENT', entityId: id, eventId: id,
      });
      notifyAdmins(db, { type: 'EVENT_UPDATED', title: `Event updated: ${after.name}`, body: `by ${req.user!.name}`, entityType: 'EVENT', entityId: id, eventId: id }, req.user!.id);
    })();
    res.json({ event: eventDetail(db, req.user!, id) });
  });

  // Participants (admin-only assignment; only registered, active users) -------------------
  r.post('/:id/participants', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const { userIds } = parse(z.object({ userIds: z.array(z.number().int().positive()).min(1).max(200) }), req.body);
    const ev = getEventRow(db, id);
    if (['CANCELLED', 'ARCHIVED'].includes(ev.status)) throw new AppError(409, `Event is ${ev.status.toLowerCase()}`, 'EVENT_STATE');
    activeUsersOnly(db, userIds);
    db.transaction(() => {
      for (const uid of new Set(userIds)) {
        db.prepare(`INSERT INTO event_participants (event_id,user_id,status,added_by) VALUES (?,?, 'ACTIVE', ?) ON CONFLICT(event_id,user_id) DO UPDATE SET status='ACTIVE', added_by=excluded.added_by`).run(id, uid, req.user!.id);
        audit(db, req.user!, 'PARTICIPANT_ADDED', 'EVENT', id, { eventId: id, metadata: { userId: uid } });
      }
      notify(db, userIds, { type: 'PARTICIPANT_ADDED', title: `You were added to "${ev.name}"`, entityType: 'EVENT', entityId: id, eventId: id });
    })();
    res.json({ event: eventDetail(db, req.user!, id) });
  });

  r.delete('/:id/participants/:userId', requireAdmin, (req, res) => {
    const id = Number(req.params.id), uid = Number(req.params.userId);
    const ev = getEventRow(db, id);
    const row = db.prepare(`SELECT status FROM event_participants WHERE event_id=? AND user_id=?`).get(id, uid) as any;
    if (!row) throw notFound('Participant not found');
    const net = eventLedger(db, id).balances.find((b) => b.userId === uid)?.netPaise ?? 0;
    db.transaction(() => {
      // Membership is marked REMOVED (never deleted) so financial history stays intact.
      db.prepare(`UPDATE event_participants SET status='REMOVED' WHERE event_id=? AND user_id=?`).run(id, uid);
      audit(db, req.user!, 'PARTICIPANT_REMOVED', 'EVENT', id, { eventId: id, metadata: { userId: uid, outstandingNetPaise: net } });
      notify(db, [uid], { type: 'PARTICIPANT_REMOVED', level: 'WARNING', title: `You were removed from "${ev.name}"`, entityType: 'EVENT', entityId: id, eventId: id });
    })();
    res.json({ ok: true, outstandingNetPaise: net, warning: net !== 0 ? 'This user still has an unsettled balance; their expense history is preserved.' : null });
  });

  r.post('/:id/leave', (req, res) => {
    const id = Number(req.params.id);
    const ev = getEventRow(db, id);
    requireActiveMember(db, req.user!, id);
    const net = eventLedger(db, id).balances.find((b) => b.userId === req.user!.id)?.netPaise ?? 0;
    if (net !== 0) throw new AppError(409, 'Settle your balance before leaving this event, or ask an admin to remove you.', 'UNSETTLED');
    db.transaction(() => {
      db.prepare(`UPDATE event_participants SET status='LEFT' WHERE event_id=? AND user_id=?`).run(id, req.user!.id);
      audit(db, req.user!, 'PARTICIPANT_LEFT', 'EVENT', id, { eventId: id });
      notifyAdmins(db, { type: 'PARTICIPANT_LEFT', title: `${req.user!.name} left "${ev.name}"`, entityType: 'EVENT', entityId: id, eventId: id });
    })();
    res.json({ ok: true });
  });

  // Checklist -----------------------------------------------------------------------------
  r.post('/:id/checklist', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    getEventRow(db, id);
    const d = parse(z.object({ title: z.string().trim().min(1).max(200), userId: z.number().int().positive().optional() }), req.body);
    const info = db.prepare(`INSERT INTO checklist_items (event_id,title,user_id) VALUES (?,?,?)`).run(id, d.title, d.userId ?? null);
    audit(db, req.user!, 'CHECKLIST_ITEM_ADDED', 'EVENT', id, { eventId: id, metadata: { title: d.title } });
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });
  r.post('/:id/checklist/:itemId/toggle', (req, res) => {
    const id = Number(req.params.id), itemId = Number(req.params.itemId);
    loadEventForUser(db, req.user!, id);
    const it = db.prepare(`SELECT * FROM checklist_items WHERE id=? AND event_id=?`).get(itemId, id) as any;
    if (!it) throw notFound('Checklist item not found');
    if (req.user!.role !== 'ADMIN') {
      requireActiveMember(db, req.user!, id);
      if (it.user_id !== null && it.user_id !== req.user!.id) throw forbidden('This item is assigned to someone else');
    }
    const done = it.done ? 0 : 1;
    db.prepare(`UPDATE checklist_items SET done=?, done_by=?, done_at=? WHERE id=?`).run(done, done ? req.user!.id : null, done ? new Date().toISOString() : null, itemId);
    res.json({ done: !!done });
  });

  // Timeline & activity feed (privacy respected) ---------------------------------------------
  r.get('/:id/timeline', (req, res) => {
    const id = Number(req.params.id);
    loadEventForUser(db, req.user!, id);
    const vis = expenseVisibilitySql(req.user!);
    const ex = db.prepare(
      `SELECT e.id, e.title, e.category, e.amount_paise, e.spent_at at, e.status, e.payer_type, e.visibility FROM expenses e WHERE e.event_id=? AND e.status<>'CANCELLED' AND ${vis.sql}`,
    ).all(id, ...vis.params) as any[];
    const tr = db.prepare(`SELECT id, from_location, to_location, transport_type, departure_at at, booking_status FROM travel_segments WHERE event_id=? AND booking_status<>'CANCELLED'`).all(id) as any[];
    const items = [
      ...ex.map((e) => ({ kind: 'EXPENSE', at: e.at, ...camel(e) })),
      ...tr.map((t) => ({ kind: 'TRAVEL', at: t.at, ...camel(t) })),
    ].filter((i) => i.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    res.json({ timeline: items });
  });

  r.get('/:id/activity', (req, res) => {
    const id = Number(req.params.id);
    loadEventForUser(db, req.user!, id);
    const limit = intQuery(req.query.limit, 50, 1, 200);
    const rows = db.prepare(`SELECT id, actor_name, action, entity_type, entity_id, metadata, created_at FROM audit_logs WHERE event_id=? ORDER BY id DESC LIMIT 400`).all(id) as any[];
    const cache = new Map<number, boolean>();
    const canSee = (eid: number) => {
      if (!cache.has(eid)) { try { getExpenseForUser(db, req.user!, eid); cache.set(eid, true); } catch { cache.set(eid, false); } }
      return cache.get(eid)!;
    };
    const out = rows
      .filter((a) => a.entity_type !== 'EXPENSE' || canSee(a.entity_id))
      .filter((a) => req.user!.role === 'ADMIN' || !['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGED', 'ADMIN_OVERRIDE'].includes(a.action) || a.action === 'ADMIN_OVERRIDE')
      .slice(0, limit)
      .map((a) => ({ ...camel(a), metadata: req.user!.role === 'ADMIN' ? a.metadata : undefined }));
    res.json({ activity: out });
  });

  return r;
}
