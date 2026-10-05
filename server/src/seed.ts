/**
 * Demo data seeder. Everything except the very first admin is created through the real HTTP API,
 * so approvals, audit logs and notifications are produced by the same code paths as production.
 *   npm run seed            -> wipes the local demo DB and seeds it
 * DEMO CREDENTIALS ONLY (documented in DEMO_ACCOUNTS.md). Never use these in a real deployment.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import { config } from './config.js';
import { openDb, type DB } from './db.js';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';

export const DEMO_ADMIN = { username: 'admin', password: 'Admin@1234', name: 'Admin (Demo)' };
export const DEMO_PASSWORD = 'Demo@1234';
export const DEMO_USERS = [
  ['dhanush', 'Dhanush', 'B.Tech CSE', '3'], ['aarav', 'Aarav Sharma', 'B.Tech CSE', '3'], ['meera', 'Meera Nair', 'B.Tech IT', '3'],
  ['karthik', 'Karthik Raj', 'B.Tech ECE', '2'], ['priya', 'Priya Menon', 'B.Tech CSE', '3'], ['rohan', 'Rohan Das', 'B.Tech AI&DS', '2'],
  ['sneha', 'Sneha Iyer', 'B.Tech IT', '3'], ['vikram', 'Vikram Singh', 'B.Tech Mech', '4'], ['ananya', 'Ananya Reddy', 'B.Tech CSE', '2'], ['rahul', 'Rahul Verma', 'B.Tech ECE', '4'],
] as const;

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export async function createBootstrapAdmin(db: DB, a: { username: string; password: string; name: string }) {
  await db.run(`INSERT INTO users (username,name,role,password_hash,must_change_password) VALUES (?,?, 'ADMIN', ?, 0)`, a.username, a.name, hashPassword(a.password));
}

export async function seedDemo(db: DB, log: (m: string) => void = () => {}) {
  await createBootstrapAdmin(db, DEMO_ADMIN);
  const server = http.createServer(createApp(db));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const tokens = new Map<string, string>();
  const ids: Record<string, number> = {};

  async function call(who: string | null, method: string, path: string, body?: unknown, form?: FormData): Promise<any> {
    const headers: Record<string, string> = {};
    if (who) headers.Authorization = `Bearer ${tokens.get(who)}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
    return json;
  }
  async function login(u: string, p: string) { tokens.set(u, (await call(null, 'POST', '/auth/login', { username: u, password: p })).token); }
  async function attach(who: string, entityType: string, entityId: number, kind: string) {
    const f = new FormData();
    f.append('entityType', entityType); f.append('entityId', String(entityId)); f.append('kind', kind);
    f.append('file', new Blob([PNG_1PX], { type: 'image/png' }), `${kind.toLowerCase()}.png`);
    await call(who, 'POST', '/attachments', undefined, f);
  }

  try {
    await login(DEMO_ADMIN.username, DEMO_ADMIN.password);
    log('Creating 10 demo users');
    for (const [username, name, dept, year] of DEMO_USERS) {
      const r = await call('admin', 'POST', '/users', {
        username, name, password: DEMO_PASSWORD, email: `${username}@demo.splitcalc.local`, phone: '9' + String(Math.floor(100000000 + Math.random() * 899999999)),
        college: 'Demo Institute of Technology', department: dept, year, emergencyContact: 'Parent: 9000000000',
      });
      ids[username] = r.user.id;
      await db.run(`UPDATE users SET must_change_password=0 WHERE id=?`, r.user.id); // demo convenience only
      await login(username, DEMO_PASSWORD);
    }
    const U = ids;
    const all = Object.values(U);
    const iso = (d: string) => new Date(d).toISOString();
    const nameOf = (id: number) => Object.keys(U).find((k) => U[k] === id)!;
    const approveAll = async (expenseId: number, exceptCreator: string) => {
      const d = (await call('admin', 'GET', `/expenses/${expenseId}`)).expense;
      for (const a of d.allocations) { const name = nameOf(a.userId); if (name !== exceptCreator && a.approvalStatus === 'PENDING') await call(name, 'POST', `/expenses/${expenseId}/respond`, { decision: 'APPROVE' }); }
    };

    // ---------------- Event 1: TRIP (completed, mostly settled) ----------------
    log('Event 1: Munnar Weekend Trip');
    const trip = (await call('admin', 'POST', '/events', {
      name: 'Munnar Weekend Trip', type: 'TRIP', description: 'Tea gardens and waterfalls with the CSE gang.', startDate: '2026-08-14', endDate: '2026-08-16', status: 'ACTIVE',
      destination: 'Munnar, Kerala', startLocation: 'Coimbatore', organizer: 'Dhanush', college: 'Demo Institute of Technology',
      participantIds: [U.dhanush, U.aarav, U.meera, U.priya, U.rohan, U.sneha],
      trip: { intermediateLocations: 'Pollachi, Udumalpet', returnDestination: 'Coimbatore', accommodation: 'Homestay near Top Station', food: 'Local restaurants', tickets: 'Bus tickets booked in advance' },
      itinerary: [
        { day: 1, time: '06:00', title: 'Bus to Munnar', kind: 'TRAVEL', location: 'Coimbatore' }, { day: 1, time: '15:00', title: 'Check-in & tea garden walk', kind: 'STAY' },
        { day: 2, time: '09:00', title: 'Eravikulam & Top Station', kind: 'TOURISM' }, { day: 3, time: '10:00', title: 'Return to Coimbatore', kind: 'TRAVEL' },
      ],
      budgets: { TRAVEL: 600000, ACCOMMODATION: 1200000, FOOD: 800000 },
      checklist: [{ title: 'Bus tickets booked' }, { title: 'Homestay confirmed' }, { title: 'Carry college ID', }],
    })).event;
    ids.trip = trip.id;
    const g1 = [U.dhanush, U.aarav, U.meera, U.priya, U.rohan, U.sneha];
    const e1 = [
      await call('dhanush', 'POST', '/expenses', { eventId: trip.id, title: 'Bus tickets (round trip)', category: 'TRAVEL', subcategory: 'bus', amountPaise: 480000, paymentMethod: 'UPI', participants: g1.map((userId) => ({ userId })), spentAt: iso('2026-08-10T10:00:00Z'), idempotencyKey: 'seed-trip-bus-0001' }),
      await call('priya', 'POST', '/expenses', { eventId: trip.id, title: 'Homestay (2 nights)', category: 'ACCOMMODATION', subcategory: 'homestay', amountPaise: 960000, paymentMethod: 'UPI', participants: g1.map((userId) => ({ userId })), spentAt: iso('2026-08-14T15:00:00Z'), idempotencyKey: 'seed-trip-stay-0001' }),
      await call('aarav', 'POST', '/expenses', { eventId: trip.id, title: 'Dinner at Rapsy', category: 'FOOD', subcategory: 'dinner', amountPaise: 330000, paymentMethod: 'CASH', participants: g1.map((userId) => ({ userId })), spentAt: iso('2026-08-14T20:30:00Z'), location: 'Munnar town', idempotencyKey: 'seed-trip-dinner-001' }),
      await call('meera', 'POST', '/expenses', { eventId: trip.id, title: 'Jeep safari', category: 'TRAVEL', subcategory: 'jeep', amountPaise: 180000, paymentMethod: 'UPI', splitMethod: 'PERCENTAGE', participants: [{ userId: U.meera, value: 2500 }, { userId: U.rohan, value: 2500 }, { userId: U.sneha, value: 2500 }, { userId: U.priya, value: 2500 }], spentAt: iso('2026-08-15T09:30:00Z'), idempotencyKey: 'seed-trip-jeep-0001' }),
    ];
    await attach('dhanush', 'EXPENSE', e1[0].expense.id, 'SCREENSHOT');
    for (const e of e1) await approveAll(e.expense.id, nameOf(e.expense.creatorId));
    // Settlements: some confirmed, one partially paid
    const settle = (await call('aarav', 'GET', `/events/${trip.id}/settlement`));
    log(`  trip suggestions: ${settle.suggestions.length}`);
    for (const s of settle.suggestions.slice(0, 3)) {
      const payer = Object.keys(U).find((k) => U[k] === s.fromUserId)!, rcv = Object.keys(U).find((k) => U[k] === s.toUserId)!;
      const r = await call(payer, 'POST', '/settlements', { eventId: trip.id, toUserId: s.toUserId, amountPaise: s.amountPaise, method: 'UPI', idempotencyKey: `seed-settle-${s.fromUserId}-${s.toUserId}` });
      await attach(payer, 'SETTLEMENT', r.settlement.id, 'PAYMENT_SCREENSHOT');
      await call(rcv, 'POST', `/settlements/${r.settlement.id}/confirm`);
    }
    // One partial payment (half of the next suggestion), left unconfirmed
    const s2 = (await call('aarav', 'GET', `/events/${trip.id}/settlement`)).suggestions[0];
    if (s2) {
      const payer = Object.keys(U).find((k) => U[k] === s2.fromUserId)!;
      await call(payer, 'POST', '/settlements', { eventId: trip.id, toUserId: s2.toUserId, amountPaise: Math.floor(s2.amountPaise / 2), method: 'CASH', note: 'Part payment', idempotencyKey: `seed-partial-${s2.fromUserId}` });
    }
    await db.run(`UPDATE events SET status='COMPLETED' WHERE id=?`, trip.id);

    // ---------------- Event 2: HACKATHON (upcoming) ----------------
    log('Event 2: Smart India Hackathon');
    const hack = (await call('admin', 'POST', '/events', {
      name: 'SIH Grand Finale - IIT Madras', type: 'HACKATHON', description: 'National-level hackathon finals, travelling as team "Byte Bandits".', startDate: '2026-11-14', endDate: '2026-11-16', status: 'UPCOMING',
      destination: 'Chennai', startLocation: 'Coimbatore', organizer: 'Dhanush', college: 'Demo Institute of Technology',
      participantIds: [U.dhanush, U.karthik, U.vikram, U.ananya, U.rahul],
      hackathon: {
        hackathonName: 'Smart India Hackathon 2026', hostOrg: 'AICTE', hostCollege: 'IIT Madras', venue: 'IITM Research Park', city: 'Chennai', state: 'Tamil Nadu',
        startsAt: '2026-11-14T09:00:00Z', endsAt: '2026-11-16T09:00:00Z', registrationStatus: 'REGISTERED', registrationDeadline: '2026-10-31', participationType: 'Team', mode: 'OFFLINE',
        collegeApproved: true, approvalStatus: 'APPROVED by HoD', independent: false, teamName: 'Byte Bandits', teamMembers: 'Dhanush, Karthik, Vikram, Ananya, Rahul',
        registrationDetails: 'Team ID BB-2291', requiredDocuments: 'College ID, Approval letter', accommodation: 'Provided by organizer (dorm)', food: 'Provided during event', transport: 'Train to Chennai', eventUrl: 'https://example.org/sih', notes: 'Bring extension boards',
      },
      budgets: { TRAVEL: 400000, HACKATHON: 300000, FOOD: 150000 },
      checklist: [{ title: 'Approval letter signed' }, { title: 'Train tickets booked' }, { title: 'Laptop & charger', userId: U.dhanush }],
    })).event;
    ids.hack = hack.id;
    await call('dhanush', 'POST', '/expenses', { eventId: hack.id, title: 'Team registration fee', category: 'HACKATHON', subcategory: 'registration', amountPaise: 100000, paymentMethod: 'UPI', payerType: 'COLLEGE', payerName: 'College (Dept. fund)', participants: [U.dhanush, U.karthik, U.vikram, U.ananya, U.rahul].map((userId) => ({ userId })), spentAt: iso('2026-10-01T09:00:00Z'), idempotencyKey: 'seed-hack-reg-00001' });
    await call('karthik', 'POST', '/expenses', { eventId: hack.id, title: 'Train tickets (advance)', category: 'TRAVEL', subcategory: 'train', amountPaise: 275000, paymentMethod: 'UPI', participants: [U.dhanush, U.karthik, U.vikram, U.ananya, U.rahul].map((userId) => ({ userId })), spentAt: iso('2026-10-02T08:00:00Z'), idempotencyKey: 'seed-hack-train-0001' });
    await call('admin', 'POST', `/events/${hack.id}/travel`, { fromLocation: 'Coimbatore Junction', toLocation: 'Chennai Central', transportType: 'TRAIN', departureAt: iso('2026-11-13T21:00:00Z'), arrivalAt: iso('2026-11-14T04:30:00Z'), vehicleDetails: 'Kovai Express 12675', bookedBy: U.karthik, payerId: U.karthik, ticketAmountPaise: 275000, bookingStatus: 'BOOKED', confirmationNumber: 'PNR 4521879034', passengerIds: [U.dhanush, U.karthik, U.vikram, U.ananya, U.rahul] });

    // ---------------- Event 3: HACKATHON + TRIP (active, the full scenario) ----------------
    log('Event 3: Kerala IIT Hackathon + Trip');
    const kerala = (await call('admin', 'POST', '/events', {
      name: 'Kerala IIT Hackathon + Trip', type: 'HACKATHON_TRIP', description: 'Hackathon at IIT Palakkad followed by a Kerala trip.', startDate: '2026-09-30', endDate: '2026-10-04', status: 'ACTIVE',
      destination: 'Palakkad & Kochi, Kerala', startLocation: 'Chennai', organizer: 'Dhanush', college: 'Demo Institute of Technology', participantIds: all,
      hackathon: { hackathonName: 'Kerala Innovation Hack', hostOrg: 'IIT Palakkad E-Cell', hostCollege: 'IIT Palakkad', venue: 'Nila Campus', city: 'Palakkad', state: 'Kerala', startsAt: '2026-10-01T09:00:00Z', endsAt: '2026-10-02T21:00:00Z', registrationStatus: 'CONFIRMED', participationType: 'Team', mode: 'OFFLINE', collegeApproved: true, approvalStatus: 'APPROVED', independent: false, teamName: 'Byte Bandits + Friends', food: 'Lunch & dinner by organizer', accommodation: 'Hostel provided on Oct 1-2', eventUrl: 'https://example.org/kerala-hack' },
      trip: { intermediateLocations: 'Palakkad, Thrissur, Kochi', returnDestination: 'Chennai', accommodation: 'Hotel Sea Breeze, Kochi (Oct 3)', food: 'Local', tickets: 'Train Chennai→Palakkad, Bus Kochi→Chennai' },
      itinerary: [
        { day: 1, time: '19:00', title: 'Train to Palakkad', kind: 'TRAVEL', location: 'Chennai Central' }, { day: 2, time: '09:00', title: 'Hackathon day 1', kind: 'HACKATHON', location: 'IIT Palakkad' },
        { day: 3, time: '09:00', title: 'Hackathon day 2 + demos', kind: 'HACKATHON', location: 'IIT Palakkad' }, { day: 4, time: '10:00', title: 'Kochi sightseeing & beach', kind: 'TOURISM', location: 'Fort Kochi' },
        { day: 5, time: '20:00', title: 'Return bus to Chennai', kind: 'TRAVEL', location: 'Kochi' },
      ],
      budgets: { TRAVEL: 2500000, ACCOMMODATION: 2000000, FOOD: 1200000, HACKATHON: 400000, OTHER: 300000 },
      checklist: [{ title: 'Train tickets booked' }, { title: 'Hotel in Kochi booked' }, { title: 'Hackathon registration confirmed' }, { title: 'ID cards & approval letter' }, { title: 'Power strips & laptops' }, { title: 'Return bus tickets' }],
    })).event;
    ids.kerala = kerala.id;
    const E = kerala.id;
    const everyone = all.map((userId) => ({ userId }));
    // travel segments
    await call('admin', 'POST', `/events/${E}/travel`, { fromLocation: 'Chennai Central', toLocation: 'Palakkad Junction', transportType: 'TRAIN', departureAt: iso('2026-09-30T19:00:00Z'), arrivalAt: iso('2026-10-01T05:45:00Z'), vehicleDetails: 'Express 12623', bookedBy: U.dhanush, payerId: U.dhanush, ticketAmountPaise: 850000, bookingStatus: 'COMPLETED', confirmationNumber: 'PNR 8831209945', passengerIds: all });
    await call('admin', 'POST', `/events/${E}/travel`, { fromLocation: 'Palakkad', toLocation: 'Kochi', transportType: 'BUS', departureAt: iso('2026-10-03T08:00:00Z'), arrivalAt: iso('2026-10-03T12:00:00Z'), vehicleDetails: 'KSRTC Super Fast', bookedBy: U.priya, payerId: U.priya, ticketAmountPaise: 300000, bookingStatus: 'CONFIRMED', passengerIds: all });
    await call('admin', 'POST', `/events/${E}/travel`, { fromLocation: 'Kochi', toLocation: 'Chennai', transportType: 'BUS', departureAt: iso('2026-10-04T20:00:00Z'), arrivalAt: iso('2026-10-05T08:00:00Z'), vehicleDetails: 'Sleeper coach', bookedBy: U.aarav, payerId: U.aarav, ticketAmountPaise: 700000, bookingStatus: 'PLANNED', passengerIds: all });

    const x1 = (await call('dhanush', 'POST', '/expenses', { eventId: E, title: 'Train tickets Chennai → Palakkad', category: 'TRAVEL', subcategory: 'train', amountPaise: 850000, paymentMethod: 'UPI', participants: everyone, spentAt: iso('2026-09-28T10:00:00Z'), idempotencyKey: 'seed-kl-train-00001' })).expense;
    await attach('dhanush', 'EXPENSE', x1.id, 'BOOKING_CONFIRMATION'); await approveAll(x1.id, 'dhanush');
    const x2 = (await call('dhanush', 'POST', '/expenses', { eventId: E, title: 'Lunch at hackathon venue (college-sponsored)', category: 'FOOD', subcategory: 'lunch', amountPaise: 300000, paymentMethod: 'CARD', payerType: 'COLLEGE', participants: everyone, spentAt: iso('2026-10-01T13:00:00Z'), idempotencyKey: 'seed-kl-college-lunch' })).expense;
    const x3 = (await call('aarav', 'POST', '/expenses', { eventId: E, title: 'Dinner at Palakkad', category: 'FOOD', subcategory: 'dinner', amountPaise: 240000, paymentMethod: 'CASH', participants: [U.aarav, U.meera, U.karthik].map((userId) => ({ userId })), spentAt: iso('2026-10-01T20:30:00Z'), location: 'Hotel Indraprastha, Palakkad', idempotencyKey: 'seed-kl-dinner-00001' })).expense;
    await approveAll(x3.id, 'aarav');
    const x4 = (await call('dhanush', 'POST', '/expenses', { eventId: E, title: 'Auto from station to campus', category: 'TRAVEL', subcategory: 'auto', amountPaise: 90000, paymentMethod: 'CASH', participants: [U.dhanush, U.meera, U.rohan].map((userId) => ({ userId })), fromLocation: 'Palakkad Junction', toLocation: 'IIT Palakkad', transportMode: 'AUTO', spentAt: iso('2026-10-01T06:15:00Z'), idempotencyKey: 'seed-kl-auto-000001' })).expense;
    await call('meera', 'POST', `/expenses/${x4.id}/respond`, { decision: 'APPROVE' }); // Rohan left pending
    const x5 = (await call('priya', 'POST', '/expenses', { eventId: E, title: 'Kochi hotel (rooms)', category: 'ACCOMMODATION', subcategory: 'hotel', amountPaise: 1800000, paymentMethod: 'UPI', splitMethod: 'SHARES', participants: [{ userId: U.dhanush, value: 2 }, { userId: U.aarav, value: 1 }, { userId: U.meera, value: 1 }, { userId: U.karthik, value: 1 }, { userId: U.priya, value: 2 }, { userId: U.rohan, value: 1 }, { userId: U.sneha, value: 1 }, { userId: U.vikram, value: 1 }, { userId: U.ananya, value: 1 }, { userId: U.rahul, value: 1 }], spentAt: iso('2026-10-02T10:00:00Z'), idempotencyKey: 'seed-kl-hotel-000001' })).expense;
    await attach('priya', 'EXPENSE', x5.id, 'RECEIPT'); await approveAll(x5.id, 'priya');
    const x6 = (await call('dhanush', 'POST', '/expenses', { eventId: E, title: 'Breakfast', category: 'FOOD', subcategory: 'breakfast', amountPaise: 90000, paymentMethod: 'UPI', participants: [U.dhanush, U.aarav, U.meera].map((userId) => ({ userId })), spentAt: iso('2026-10-02T08:30:00Z'), idempotencyKey: 'seed-kl-breakfast-01' })).expense;
    await call('aarav', 'POST', `/expenses/${x6.id}/respond`, { decision: 'APPROVE' });
    await call('meera', 'POST', `/expenses/${x6.id}/respond`, { decision: 'DECLINE', note: 'I skipped breakfast' }); // declined -> needs correction
    await call('rahul', 'POST', '/expenses', { eventId: E, title: 'Medicine (private)', category: 'MEDICAL', amountPaise: 50000, paymentMethod: 'CASH', visibility: 'PRIVATE', privateReason: 'Personal medical expense', participants: [{ userId: U.rahul }], spentAt: iso('2026-10-02T11:00:00Z'), idempotencyKey: 'seed-kl-medicine-001' });
    await call('sneha', 'POST', '/expenses', { eventId: E, title: 'Souvenirs', category: 'PERSONAL', subcategory: 'shopping', amountPaise: 35000, paymentMethod: 'UPI', participants: [{ userId: U.sneha }], spentAt: iso('2026-10-02T12:00:00Z'), idempotencyKey: 'seed-kl-souvenir-001' });
    await call('vikram', 'POST', '/expenses', { eventId: E, title: 'Hackathon registration (organizer-paid)', category: 'HACKATHON', subcategory: 'registration', amountPaise: 200000, paymentMethod: 'BANK_TRANSFER', payerType: 'ORGANIZATION', payerName: 'IIT Palakkad E-Cell', participants: everyone, spentAt: iso('2026-10-01T09:00:00Z'), idempotencyKey: 'seed-kl-org-reg-0001' });
    const x9 = (await call('vikram', 'POST', '/expenses', { eventId: E, title: 'Cab to Fort Kochi', category: 'TRAVEL', subcategory: 'cab', amountPaise: 135000, paymentMethod: 'UPI', splitMethod: 'PERCENTAGE', participants: [{ userId: U.vikram, value: 4000 }, { userId: U.ananya, value: 3000 }, { userId: U.rahul, value: 2000 }, { userId: U.sneha, value: 1000 }], fromLocation: 'Kochi Hotel', toLocation: 'Fort Kochi', transportMode: 'CAB', spentAt: iso('2026-10-02T16:00:00Z'), idempotencyKey: 'seed-kl-cab-0000001' })).expense;
    await approveAll(x9.id, 'vikram');
    await call('ananya', 'POST', '/expenses', { eventId: E, title: 'Surprise gift for Karthik & Priya', category: 'SHOPPING', amountPaise: 120000, paymentMethod: 'UPI', visibility: 'PRIVATE', privateReason: 'Surprise - not for the rest of the group', participants: [U.ananya, U.karthik, U.priya].map((userId) => ({ userId })), spentAt: iso('2026-10-02T17:00:00Z'), idempotencyKey: 'seed-kl-gift-0000001' });
    const x12 = (await call('meera', 'POST', '/expenses', { eventId: E, title: 'Snacks & chai', category: 'FOOD', subcategory: 'snacks', amountPaise: 64000, paymentMethod: 'CASH', participants: everyone, spentAt: iso('2026-10-02T17:30:00Z'), idempotencyKey: 'seed-kl-snacks-00001' })).expense;
    await call('rahul', 'POST', `/expenses/${x12.id}/dispute`, { reason: 'I was not there for snacks', message: 'I was at the pharmacy at that time.' });
    // group-member payer needing confirmation
    await call('karthik', 'POST', '/expenses', { eventId: E, title: 'Toll & parking', category: 'TRAVEL', subcategory: 'toll', amountPaise: 45000, paymentMethod: 'CARD', payerType: 'GROUP_MEMBER', payerUserId: U.vikram, participants: [U.vikram, U.karthik, U.rahul].map((userId) => ({ userId })), spentAt: iso('2026-10-03T07:00:00Z'), idempotencyKey: 'seed-kl-toll-0000001' });
    // settlements on the live event
    const ks = await call('dhanush', 'GET', `/events/${E}/settlement`);
    const first = ks.suggestions[0];
    if (first) {
      const payer = Object.keys(U).find((k) => U[k] === first.fromUserId)!;
      await call(payer, 'POST', '/settlements', { eventId: E, toUserId: first.toUserId, amountPaise: Math.min(first.amountPaise, 100000), method: 'UPI', note: 'Advance part payment', idempotencyKey: 'seed-kl-settle-0001' });
    }
    // an admin message and a problem report to populate those screens
    await call('admin', 'POST', '/notifications/broadcast', { eventId: E, title: 'Reminder: approve your shares', body: 'Please review pending expense approvals before the trip ends.', level: 'INFO' });
    await call('priya', 'POST', '/problems', { title: 'Receipt upload is slow on hotel wifi', description: 'Uploading the hotel receipt took several tries on slow wifi.', category: 'UPLOAD', deviceInfo: 'Android 14, demo' });
    log('Seed complete');
  } finally {
    await new Promise((r) => server.close(r));
  }
  return ids;
}

// CLI entry: `npm run seed` seeds the LOCAL embedded database (never a remote DATABASE_URL unless SEED_REMOTE=yes)
if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) {
  const remote = /^postgres/i.test(config.databaseUrl);
  if (remote && process.env.SEED_REMOTE !== 'yes') {
    console.error('Refusing to seed a remote database. Set SEED_REMOTE=yes if you really mean it (this adds demo accounts).');
    process.exit(1);
  }
  if (!remote && fs.existsSync(config.databaseUrl)) fs.rmSync(config.databaseUrl, { recursive: true, force: true });
  const db = await openDb(config.databaseUrl);
  await seedDemo(db, (m) => console.log(m));
  const c = async (t: string) => (await db.get<any>(`SELECT COUNT(*) c FROM ${t}`))!.c;
  console.log(`Seeded: ${await c('users')} users, ${await c('events')} events, ${await c('expenses')} expenses, ${await c('settlements')} settlements, ${await c('notifications')} notifications, ${await c('audit_logs')} audit rows`);
  console.log(`Demo admin: ${DEMO_ADMIN.username} / ${DEMO_ADMIN.password}   Demo users: <username> / ${DEMO_PASSWORD}`);
  await db.close();
}