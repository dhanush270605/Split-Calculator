import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db.js';
import { requireAuth } from '../auth.js';
import { AppError, badRequest, forbidden, notFound } from '../errors.js';
import { audit, notify, camel, camelAll } from '../helpers.js';
import { parse, optStr, isoDate, TRANSPORT, paise } from '../validate.js';
import { loadEventForUser, requireActiveMember, isActiveMember } from '../access.js';

const base = {
  fromLocation: z.string().trim().min(1).max(200), toLocation: z.string().trim().min(1).max(200),
  departureAt: isoDate.optional().nullable(), arrivalAt: isoDate.optional().nullable(),
  transportType: z.enum(TRANSPORT), vehicleDetails: optStr(300),
  bookedBy: z.number().int().positive().optional().nullable(), payerId: z.number().int().positive().optional().nullable(),
  ticketAmountPaise: paise.or(z.literal(0)).default(0),
  bookingStatus: z.enum(['PLANNED', 'BOOKED', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).default('PLANNED'),
  confirmationNumber: optStr(100), notes: optStr(1000),
  passengerIds: z.array(z.number().int().positive()).max(200).default([]),
};
const createSchema = z.object(base);
const updateSchema = z.object(Object.fromEntries(Object.entries(base).map(([k, v]) => [k, (v as z.ZodTypeAny).optional()])) as { [K in keyof typeof base]: z.ZodOptional<(typeof base)[K]> });

function segmentDetail(db: DB, id: number) {
  const s = db.prepare(
    `SELECT t.*, b.name booked_by_name, p.name payer_name FROM travel_segments t LEFT JOIN users b ON b.id=t.booked_by LEFT JOIN users p ON p.id=t.payer_id WHERE t.id=?`,
  ).get(id) as any;
  if (!s) throw notFound('Travel segment not found');
  const passengers = db.prepare(`SELECT u.id, u.name FROM travel_passengers tp JOIN users u ON u.id=tp.user_id WHERE tp.segment_id=? ORDER BY u.name`).all(id);
  const attachments = db.prepare(`SELECT id, original_name, mime, size, kind FROM attachments WHERE entity_type='TRAVEL' AND entity_id=?`).all(id);
  return { ...camel(s), passengers: camelAll(passengers), attachments: camelAll(attachments) };
}

function checkTimes(dep?: string | null, arr?: string | null) {
  if (dep && arr && Date.parse(arr) < Date.parse(dep)) throw badRequest('Arrival must not be before departure');
}
function checkPeople(db: DB, eventId: number, ids: (number | null | undefined)[]) {
  for (const i of ids) if (i && !isActiveMember(db, eventId, i)) throw badRequest(`User ${i} is not an active participant of this event`);
}

export function travelRouter(db: DB) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/events/:id/travel', (req, res) => {
    const id = Number(req.params.id);
    loadEventForUser(db, req.user!, id);
    const ids = (db.prepare(`SELECT id FROM travel_segments WHERE event_id=? ORDER BY departure_at, id`).all(id) as any[]).map((s) => s.id);
    res.json({ segments: ids.map((i) => segmentDetail(db, i)) });
  });

  r.post('/events/:id/travel', (req, res) => {
    const id = Number(req.params.id);
    const ev = loadEventForUser(db, req.user!, id);
    requireActiveMember(db, req.user!, id);
    if (['CANCELLED', 'ARCHIVED'].includes(ev.status) && req.user!.role !== 'ADMIN') throw new AppError(409, 'Event is closed', 'EVENT_STATE');
    const d = parse(createSchema, req.body);
    checkTimes(d.departureAt, d.arrivalAt);
    const bookedBy = req.user!.role === 'ADMIN' ? d.bookedBy ?? null : req.user!.id;
    checkPeople(db, id, [bookedBy, d.payerId, ...d.passengerIds]);
    const sid = db.transaction(() => {
      const info = db.prepare(
        `INSERT INTO travel_segments (event_id,from_location,to_location,departure_at,arrival_at,transport_type,vehicle_details,booked_by,payer_id,ticket_amount_paise,booking_status,confirmation_number,notes,created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(id, d.fromLocation, d.toLocation, d.departureAt ?? null, d.arrivalAt ?? null, d.transportType, d.vehicleDetails ?? null, bookedBy, d.payerId ?? null, d.ticketAmountPaise, d.bookingStatus, d.confirmationNumber ?? null, d.notes ?? null, req.user!.id);
      const sid = Number(info.lastInsertRowid);
      for (const p of new Set(d.passengerIds)) db.prepare(`INSERT INTO travel_passengers (segment_id,user_id) VALUES (?,?)`).run(sid, p);
      audit(db, req.user!, 'TRAVEL_CREATED', 'TRAVEL', sid, { eventId: id, next: { from: d.fromLocation, to: d.toLocation, type: d.transportType } });
      notify(db, d.passengerIds.filter((p) => p !== req.user!.id), { type: 'TRAVEL_ADDED', title: `Travel added: ${d.fromLocation} → ${d.toLocation}`, body: d.transportType, entityType: 'TRAVEL', entityId: sid, eventId: id });
      return sid;
    })();
    res.status(201).json({ segment: segmentDetail(db, sid) });
  });

  r.patch('/travel/:sid', (req, res) => {
    const sid = Number(req.params.sid);
    const cur = db.prepare(`SELECT * FROM travel_segments WHERE id=?`).get(sid) as any;
    if (!cur) throw notFound('Travel segment not found');
    loadEventForUser(db, req.user!, cur.event_id);
    if (req.user!.role !== 'ADMIN' && cur.created_by !== req.user!.id && cur.booked_by !== req.user!.id) throw forbidden('Only the person who booked this, or an admin, can change it');
    const d = parse(updateSchema, req.body);
    checkTimes(d.departureAt !== undefined ? d.departureAt : cur.departure_at, d.arrivalAt !== undefined ? d.arrivalAt : cur.arrival_at);
    checkPeople(db, cur.event_id, [d.bookedBy, d.payerId, ...(d.passengerIds ?? [])]);
    const before = segmentDetail(db, sid);
    const map: Record<string, any> = {
      from_location: d.fromLocation, to_location: d.toLocation, departure_at: d.departureAt, arrival_at: d.arrivalAt, transport_type: d.transportType,
      vehicle_details: d.vehicleDetails, booked_by: req.user!.role === 'ADMIN' ? d.bookedBy : undefined, payer_id: d.payerId, ticket_amount_paise: d.ticketAmountPaise,
      booking_status: d.bookingStatus, confirmation_number: d.confirmationNumber, notes: d.notes,
    };
    db.transaction(() => {
      const keys = Object.keys(map).filter((k) => map[k] !== undefined);
      if (keys.length) db.prepare(`UPDATE travel_segments SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(...keys.map((k) => map[k]), sid);
      if (d.passengerIds) {
        db.prepare(`DELETE FROM travel_passengers WHERE segment_id=?`).run(sid);
        for (const p of new Set(d.passengerIds)) db.prepare(`INSERT INTO travel_passengers (segment_id,user_id) VALUES (?,?)`).run(sid, p);
      }
      audit(db, req.user!, 'TRAVEL_UPDATED', 'TRAVEL', sid, { eventId: cur.event_id, previous: before, next: segmentDetail(db, sid) });
      const pass = (db.prepare(`SELECT user_id FROM travel_passengers WHERE segment_id=?`).all(sid) as any[]).map((p) => p.user_id);
      notify(db, pass.filter((p) => p !== req.user!.id), { type: 'TRAVEL_UPDATED', title: `Travel updated: ${cur.from_location} → ${cur.to_location}`, entityType: 'TRAVEL', entityId: sid, eventId: cur.event_id });
    })();
    res.json({ segment: segmentDetail(db, sid) });
  });

  return r;
}
