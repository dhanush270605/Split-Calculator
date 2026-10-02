import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx, type Ctx } from './kit.js';

let c: Ctx;
beforeEach(async () => { c = await makeCtx(); });

const eq = (...u: string[]) => (ids: Ctx['ids']) => u.map((n) => ({ userId: ids[n] }));

describe('auth & users', () => {
  it('logs in, rejects bad credentials, returns profile', async () => {
    const bad = await c.api.post('/api/auth/login').send({ username: 'alice', password: 'nope' });
    expect(bad.status).toBe(401);
    const ok = await c.api.post('/api/auth/login').send({ username: 'alice', password: 'Passw0rd!' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.passwordHash).toBeUndefined();
    const me = await c.as('alice').get('/auth/me');
    expect(me.body.user.username).toBe('alice');
  });
  it('admin creates a user with a generated temp password and that user must change it', async () => {
    const r = await c.as('admin').post('/users', { username: 'newbie', name: 'New Bie' });
    expect(r.status).toBe(201);
    const temp = r.body.temporaryPassword as string;
    expect(temp.length).toBeGreaterThanOrEqual(10);
    const login = await c.api.post('/api/auth/login').send({ username: 'newbie', password: temp });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const blocked = await c.api.get('/api/events').set('Authorization', `Bearer ${login.body.token}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('MUST_CHANGE_PASSWORD');
    const ch = await c.api.post('/api/auth/change-password').set('Authorization', `Bearer ${login.body.token}`).send({ currentPassword: temp, newPassword: 'BrandNew123' });
    expect(ch.status).toBe(200);
    const after = await c.api.get('/api/events').set('Authorization', `Bearer ${ch.body.token}`);
    expect(after.status).toBe(200);
    // old token no longer valid
    expect((await c.api.get('/api/events').set('Authorization', `Bearer ${login.body.token}`)).status).toBe(401);
  });
  it('passwords are stored hashed', () => {
    const row = c.db.prepare(`SELECT password_hash FROM users WHERE username='alice'`).get() as any;
    expect(row.password_hash).not.toContain('Passw0rd');
    expect(row.password_hash.startsWith('$2')).toBe(true);
  });
  it('deactivated users are locked out immediately', async () => {
    await c.as('admin').post(`/users/${c.ids.bob}/status`, { status: 'INACTIVE' });
    expect((await c.as('bob').get('/auth/me')).status).toBe(401);
    expect((await c.api.post('/api/auth/login').send({ username: 'bob', password: 'Passw0rd!' })).status).toBe(401);
  });
});

describe('events, participants, travel', () => {
  it('admin creates Trip, Hackathon, Hackathon+Trip with type-specific details', async () => {
    const t = await c.as('admin').post('/events', { name: 'T', type: 'TRIP', startDate: '2026-01-01', endDate: '2026-01-03', trip: { returnDestination: 'Home' } });
    const h = await c.as('admin').post('/events', { name: 'H', type: 'HACKATHON', startDate: '2026-01-01', endDate: '2026-01-03', hackathon: { hackathonName: 'Hack', teamName: 'Team' } });
    const ht = await c.as('admin').post('/events', { name: 'HT', type: 'HACKATHON_TRIP', startDate: '2026-01-01', endDate: '2026-01-03', hackathon: { venue: 'IIT' }, trip: { returnDestination: 'Home' }, itinerary: [{ day: 1, title: 'Travel' }] });
    expect(t.body.event.trip.returnDestination).toBe('Home'); expect(t.body.event.hackathon).toBeNull();
    expect(h.body.event.hackathon.teamName).toBe('Team'); expect(h.body.event.trip).toBeNull();
    expect(ht.body.event.hackathon.venue).toBe('IIT'); expect(ht.body.event.trip.returnDestination).toBe('Home'); expect(ht.body.event.itinerary).toHaveLength(1);
  });
  it('rejects end date before start date', async () => {
    const r = await c.as('admin').post('/events', { name: 'Bad', type: 'TRIP', startDate: '2026-02-05', endDate: '2026-02-01' });
    expect(r.status).toBe(400);
  });
  it('extending an event is audited and notifies participants', async () => {
    const e = await c.event();
    const r = await c.as('admin').patch(`/events/${e}`, { endDate: '2026-10-09', reason: 'Flight delayed' });
    expect(r.status).toBe(200);
    const log = c.db.prepare(`SELECT * FROM audit_logs WHERE action='EVENT_EXTENDED' AND entity_id=?`).get(e) as any;
    expect(log).toBeTruthy();
    expect(JSON.parse(log.previous_state).endDate).toBe('2026-10-05');
    const n = await c.as('alice').get('/notifications?type=EVENT_IMPORTANT_CHANGE');
    expect(n.body.notifications.length).toBe(1);
  });
  it('users only see events they belong to', async () => {
    const e = await c.event();
    expect((await c.as('alice').get('/events')).body.events.map((x: any) => x.id)).toContain(e);
    expect((await c.as('outsider').get('/events')).body.events).toHaveLength(0);
    expect((await c.as('outsider').get(`/events/${e}`)).status).toBe(404);
  });
  it('only registered active users can be participants', async () => {
    const e = await c.event();
    expect((await c.as('admin').post(`/events/${e}/participants`, { userIds: [99999] })).status).toBe(400);
    await c.as('admin').post(`/users/${c.ids.outsider}/status`, { status: 'INACTIVE' });
    expect((await c.as('admin').post(`/events/${e}/participants`, { userIds: [c.ids.outsider] })).status).toBe(400);
  });
  it('travel segment validates times and passengers', async () => {
    const e = await c.event();
    const bad = await c.as('alice').post(`/events/${e}/travel`, { fromLocation: 'A', toLocation: 'B', transportType: 'BUS', departureAt: '2026-10-02T10:00:00Z', arrivalAt: '2026-10-02T08:00:00Z' });
    expect(bad.status).toBe(400);
    const nonMember = await c.as('alice').post(`/events/${e}/travel`, { fromLocation: 'A', toLocation: 'B', transportType: 'BUS', passengerIds: [c.ids.outsider] });
    expect(nonMember.status).toBe(400);
    const ok = await c.as('alice').post(`/events/${e}/travel`, { fromLocation: 'A', toLocation: 'B', transportType: 'AUTO', ticketAmountPaise: 90000, passengerIds: [c.ids.alice, c.ids.bob] });
    expect(ok.status).toBe(201);
    expect(ok.body.segment.bookedBy).toBe(c.ids.alice);
    expect(ok.body.segment.passengers).toHaveLength(2);
  });
});

describe('expense flow: create → approve → decline → settle', () => {
  it('spec example: 300 paid by alice, equal over alice/bob/carol; approvals gate the debt', async () => {
    const e = await c.event();
    const r = await c.expense('alice', { eventId: e, participants: eq('alice', 'bob', 'carol')(c.ids) });
    expect(r.status).toBe(201);
    const x = r.body.expense;
    expect(x.status).toBe('PENDING_APPROVAL');
    expect(x.allocations.map((a: any) => a.sharePaise)).toEqual([10000, 10000, 10000]);
    // pending: nobody owes anything yet
    let s = (await c.as('alice').get(`/events/${e}/settlement`)).body;
    expect(s.suggestions).toEqual([]);
    // bob gets an ACTION_REQUIRED notification
    const n = (await c.as('bob').get('/notifications?unread=true')).body.notifications.find((n: any) => n.type === 'APPROVAL_REQUESTED');
    expect(n.level).toBe('ACTION_REQUIRED');
    // approvals inbox
    expect((await c.as('bob').get('/approvals')).body.approvals).toHaveLength(1);
    await c.as('bob').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    await c.as('carol').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    s = (await c.as('alice').get(`/events/${e}/settlement`)).body;
    expect(s.balances.find((b: any) => b.userId === c.ids.alice).netPaise).toBe(20000);
    expect(s.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromUserId: c.ids.bob, toUserId: c.ids.alice, amountPaise: 10000 }),
      expect.objectContaining({ fromUserId: c.ids.carol, toUserId: c.ids.alice, amountPaise: 10000 }),
    ]));
    expect((await c.as('alice').get(`/expenses/${x.id}`)).body.expense.status).toBe('APPROVED');
  });

  it('decline removes the share from debt and flags the expense for correction; edit + resubmit recovers it', async () => {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, amountPaise: 90000, participants: eq('alice', 'bob', 'carol')(c.ids) })).body.expense;
    await c.as('bob').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    const d = await c.as('carol').post(`/expenses/${x.id}/respond`, { decision: 'DECLINE', note: 'Not me' });
    expect(d.body.expense.status).toBe('DECLINED');
    let s = (await c.as('alice').get(`/events/${e}/settlement`)).body;
    expect(s.balances.find((b: any) => b.userId === c.ids.carol).netPaise).toBe(0);
    expect(s.balances.find((b: any) => b.userId === c.ids.bob).netPaise).toBe(-30000);
    expect(s.totals.pendingPaise).toBe(30000);
    // creator notified with the reason
    const note = (await c.as('alice').get('/notifications')).body.notifications.find((n: any) => n.type === 'APPROVAL_DECLINED');
    expect(note.body).toBe('Not me');
    // creator corrects: remove carol, re-split between alice & bob (bob's share changes -> needs re-approval)
    const fix = await c.as('alice').patch(`/expenses/${x.id}`, { expectedVersion: (await c.as('alice').get(`/expenses/${x.id}`)).body.expense.version, participants: eq('alice', 'bob')(c.ids) });
    expect(fix.status).toBe(200);
    expect(fix.body.expense.allocations).toHaveLength(2);
    expect(fix.body.expense.status).toBe('PENDING_APPROVAL');
    s = (await c.as('alice').get(`/events/${e}/settlement`)).body;
    expect(s.balances.find((b: any) => b.userId === c.ids.bob).netPaise).toBe(0); // bob must re-approve the new 450
    await c.as('bob').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    s = (await c.as('alice').get(`/events/${e}/settlement`)).body;
    expect(s.balances.find((b: any) => b.userId === c.ids.bob).netPaise).toBe(-45000);
    // history preserved
    const actions = (c.db.prepare(`SELECT action FROM audit_logs WHERE entity_type='EXPENSE' AND entity_id=? ORDER BY id`).all(x.id) as any[]).map((a) => a.action);
    expect(actions).toEqual(['EXPENSE_CREATED', 'EXPENSE_APPROVED', 'EXPENSE_DECLINED', 'EXPENSE_UPDATED', 'EXPENSE_APPROVED']);
  });

  it('editing the amount after approval resets affected approvals and recalculates', async () => {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, amountPaise: 20000, participants: eq('alice', 'bob')(c.ids) })).body.expense;
    await c.as('bob').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    expect((await c.as('alice').get(`/events/${e}/settlement`)).body.balances.find((b: any) => b.userId === c.ids.bob).netPaise).toBe(-10000);
    const up = await c.as('alice').patch(`/expenses/${x.id}`, { expectedVersion: 2, amountPaise: 40000 });
    expect(up.body.expense.status).toBe('PENDING_APPROVAL');
    expect((await c.as('alice').get(`/events/${e}/settlement`)).body.balances.find((b: any) => b.userId === c.ids.bob).netPaise).toBe(0);
    await c.as('bob').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    expect((await c.as('alice').get(`/events/${e}/settlement`)).body.balances.find((b: any) => b.userId === c.ids.bob).netPaise).toBe(-20000);
  });

  it('concurrent edits are detected via version (409)', async () => {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, participants: eq('alice', 'bob')(c.ids) })).body.expense;
    const a = await c.as('alice').patch(`/expenses/${x.id}`, { expectedVersion: x.version, title: 'Edit 1' });
    expect(a.status).toBe(200);
    const b = await c.as('alice').patch(`/expenses/${x.id}`, { expectedVersion: x.version, title: 'Edit 2' });
    expect(b.status).toBe(409);
  });

  it('college-sponsored: zero member debt, counted in total and marked sponsored', async () => {
    const e = await c.event();
    const r = await c.expense('alice', { eventId: e, amountPaise: 300000, payerType: 'COLLEGE', participants: eq('alice', 'bob', 'carol', 'dave')(c.ids) });
    expect(r.status).toBe(201);
    expect(r.body.expense.status).toBe('APPROVED');
    const s = (await c.as('bob').get(`/events/${e}/settlement`)).body;
    expect(s.totals).toMatchObject({ totalPaise: 300000, sponsoredPaise: 300000, groupPaise: 0 });
    expect(s.suggestions).toEqual([]);
    expect(s.balances.every((b: any) => b.netPaise === 0)).toBe(true);
  });

  it('personal expense creates no group debt and no approval request', async () => {
    const e = await c.event();
    const r = await c.expense('bob', { eventId: e, category: 'PERSONAL', amountPaise: 50000, participants: eq('alice', 'carol')(c.ids) /* ignored */ });
    expect(r.body.expense.allocations).toHaveLength(1);
    expect(r.body.expense.allocations[0].userId).toBe(c.ids.bob);
    const s = (await c.as('bob').get(`/events/${e}/settlement`)).body;
    expect(s.totals.personalPaise).toBe(50000);
    expect(s.suggestions).toEqual([]);
    expect((await c.as('alice').get('/approvals')).body.approvals).toHaveLength(0);
  });

  it('all four non-equal split methods work and reject unbalanced input', async () => {
    const e = await c.event();
    const custom = await c.expense('alice', { eventId: e, amountPaise: 30000, splitMethod: 'CUSTOM', participants: [{ userId: c.ids.alice, value: 10000 }, { userId: c.ids.bob, value: 7500 }, { userId: c.ids.carol, value: 12500 }] });
    expect(custom.body.expense.allocations.map((a: any) => a.sharePaise).sort((a: number, b: number) => a - b)).toEqual([7500, 10000, 12500]);
    const unbalanced = await c.expense('alice', { eventId: e, title: 'x2', amountPaise: 30000, splitMethod: 'CUSTOM', participants: [{ userId: c.ids.alice, value: 10000 }, { userId: c.ids.bob, value: 7500 }] });
    expect(unbalanced.status).toBe(400);
    const pct = await c.expense('alice', { eventId: e, title: 'x3', amountPaise: 100000, splitMethod: 'PERCENTAGE', participants: [{ userId: c.ids.alice, value: 5000 }, { userId: c.ids.bob, value: 3000 }, { userId: c.ids.carol, value: 2000 }] });
    expect(pct.body.expense.allocations.map((a: any) => a.sharePaise).sort((a: number, b: number) => a - b)).toEqual([20000, 30000, 50000]);
    const badPct = await c.expense('alice', { eventId: e, title: 'x4', amountPaise: 100000, splitMethod: 'PERCENTAGE', participants: [{ userId: c.ids.alice, value: 5000 }, { userId: c.ids.bob, value: 3000 }] });
    expect(badPct.status).toBe(400);
    const sh = await c.expense('alice', { eventId: e, title: 'x5', amountPaise: 40000, splitMethod: 'SHARES', participants: [{ userId: c.ids.alice, value: 2 }, { userId: c.ids.bob, value: 1 }, { userId: c.ids.carol, value: 1 }] });
    expect(sh.body.expense.allocations.map((a: any) => a.sharePaise).sort((a: number, b: number) => a - b)).toEqual([10000, 10000, 20000]);
  });

  it('validates invalid, negative and huge amounts', async () => {
    const e = await c.event();
    const p = eq('alice', 'bob')(c.ids);
    expect((await c.expense('alice', { eventId: e, amountPaise: -100, participants: p })).status).toBe(400);
    expect((await c.expense('alice', { eventId: e, amountPaise: 0, participants: p })).status).toBe(400);
    expect((await c.expense('alice', { eventId: e, amountPaise: 12.5, participants: p })).status).toBe(400);
    expect((await c.expense('alice', { eventId: e, amountPaise: 99999999999999, participants: p })).status).toBe(400);
    expect((await c.expense('alice', { eventId: e, amountPaise: 1000, participants: [] })).status).toBe(400);
  });

  it('idempotent creation: retrying the same key never duplicates', async () => {
    const e = await c.event();
    const body = { eventId: e, participants: eq('alice', 'bob')(c.ids), idempotencyKey: 'retry-key-0001' };
    const a = await c.as('alice').post('/expenses', { title: 'Retry', category: 'FOOD', amountPaise: 1000, paymentMethod: 'CASH', spentAt: new Date().toISOString(), ...body });
    const b = await c.as('alice').post('/expenses', { title: 'Retry', category: 'FOOD', amountPaise: 1000, paymentMethod: 'CASH', spentAt: new Date().toISOString(), ...body });
    expect(a.status).toBe(201); expect(b.status).toBe(200); expect(b.body.duplicate).toBe(true);
    expect(b.body.expense.id).toBe(a.body.expense.id);
    expect((c.db.prepare(`SELECT COUNT(*) c FROM expenses`).get() as any).c).toBe(1);
  });

  it('flags probable double-submits without a key unless confirmed', async () => {
    const e = await c.event();
    const base = { eventId: e, title: 'Same', category: 'FOOD', amountPaise: 5000, paymentMethod: 'CASH', spentAt: new Date().toISOString(), participants: eq('alice')(c.ids) };
    expect((await c.as('alice').post('/expenses', base)).status).toBe(201);
    expect((await c.as('alice').post('/expenses', base)).status).toBe(409);
    expect((await c.as('alice').post('/expenses', { ...base, confirmDuplicate: true })).status).toBe(201);
  });

  it('group-member payer must confirm before the expense counts', async () => {
    const e = await c.event();
    const r = await c.expense('alice', { eventId: e, payerType: 'GROUP_MEMBER', payerUserId: c.ids.bob, participants: eq('alice', 'bob')(c.ids) });
    expect(r.status).toBe(201);
    await c.as('bob').post(`/expenses/${r.body.expense.id}/respond`, { decision: 'APPROVE' });
    const s = (await c.as('alice').get(`/events/${e}/settlement`)).body;
    expect(s.balances.find((b: any) => b.userId === c.ids.alice).netPaise).toBe(-15000);
    expect(s.balances.find((b: any) => b.userId === c.ids.bob).netPaise).toBe(15000);
  });

  it('dispute notifies admin; admin resolves; expense returns to correct status', async () => {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, participants: eq('alice', 'bob')(c.ids) })).body.expense;
    await c.as('bob').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    const d = await c.as('bob').post(`/expenses/${x.id}/dispute`, { reason: 'Wrong amount', message: 'Bill was 250' });
    expect(d.status).toBe(201);
    expect(d.body.expense.status).toBe('DISPUTED');
    expect((await c.as('admin').get('/notifications?type=EXPENSE_DISPUTED')).body.notifications.length).toBe(1);
    expect((await c.as('bob').post(`/expenses/${x.id}/dispute`, { reason: 'again' })).status).toBe(409);
    const res = await c.as('admin').post(`/disputes/${d.body.disputeId}/resolve`, { status: 'RESOLVED', note: 'Verified bill' });
    expect(res.status).toBe(200);
    expect((await c.as('alice').get(`/expenses/${x.id}`)).body.expense.status).toBe('APPROVED');
    expect((await c.as('admin').post(`/disputes/${d.body.disputeId}/resolve`, { status: 'RESOLVED' })).status).toBe(400); // note required
  });

  it('event state rules: no expenses in a completed event for users, admin can', async () => {
    const e = await c.event({ status: 'COMPLETED' });
    expect((await c.expense('alice', { eventId: e, participants: eq('alice')(c.ids) })).status).toBe(409);
    expect((await c.expense('admin', { eventId: e, payerUserId: c.ids.alice, participants: eq('alice')(c.ids) })).status).toBe(201);
  });
});

describe('settlements', () => {
  async function setup() {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, amountPaise: 30000, participants: eq('alice', 'bob', 'carol')(c.ids) })).body.expense;
    await c.as('bob').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    await c.as('carol').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    return { e, x };
  }
  it('mark paid → confirm; partial payments; duplicate confirmation is a no-op; overpayment blocked', async () => {
    const { e } = await setup();
    const over = await c.as('bob').post('/settlements', { eventId: e, toUserId: c.ids.alice, amountPaise: 10001, method: 'UPI' });
    expect(over.status).toBe(400);
    const p = await c.as('bob').post('/settlements', { eventId: e, toUserId: c.ids.alice, amountPaise: 4000, method: 'UPI', idempotencyKey: 'settle-key-0001' });
    expect(p.status).toBe(201); expect(p.body.settlement.status).toBe('PAID');
    const dup = await c.as('bob').post('/settlements', { eventId: e, toUserId: c.ids.alice, amountPaise: 4000, method: 'UPI', idempotencyKey: 'settle-key-0001' });
    expect(dup.body.duplicate).toBe(true);
    expect((c.db.prepare(`SELECT COUNT(*) c FROM settlements`).get() as any).c).toBe(1);
    // payer cannot confirm own payment; unconfirmed does not change balance
    expect((await c.as('bob').post(`/settlements/${p.body.settlement.id}/confirm`)).status).toBe(403);
    expect((await c.as('alice').get(`/events/${e}/settlement`)).body.balances.find((b: any) => b.userId === c.ids.bob).netPaise).toBe(-10000);
    const cf = await c.as('alice').post(`/settlements/${p.body.settlement.id}/confirm`);
    expect(cf.body.settlement.status).toBe('CONFIRMED');
    const cf2 = await c.as('alice').post(`/settlements/${p.body.settlement.id}/confirm`);
    expect(cf2.body.duplicate).toBe(true);
    expect((c.db.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE action='SETTLEMENT_CONFIRMED'`).get() as any).c).toBe(1);
    expect((await c.as('alice').get(`/events/${e}/settlement`)).body.balances.find((b: any) => b.userId === c.ids.bob).netPaise).toBe(-6000);
  });
  it('full settlement zeroes balances and marks expenses SETTLED', async () => {
    const { e, x } = await setup();
    for (const who of ['bob', 'carol']) {
      const p = await c.as(who).post('/settlements', { eventId: e, toUserId: c.ids.alice, amountPaise: 10000, method: 'CASH' });
      await c.as('alice').post(`/settlements/${p.body.settlement.id}/confirm`);
    }
    const s = (await c.as('alice').get(`/events/${e}/settlement`)).body;
    expect(s.balances.every((b: any) => b.netPaise === 0)).toBe(true);
    expect(s.suggestions).toEqual([]);
    expect((await c.as('alice').get(`/expenses/${x.id}`)).body.expense.status).toBe('SETTLED');
  });
  it('receiver can dispute; admin override requires reason and is audited', async () => {
    const { e } = await setup();
    const p = await c.as('bob').post('/settlements', { eventId: e, toUserId: c.ids.alice, amountPaise: 10000 });
    const d = await c.as('alice').post(`/settlements/${p.body.settlement.id}/dispute`, { note: 'Not received' });
    expect(d.body.settlement.status).toBe('DISPUTED');
    expect((await c.as('admin').post(`/settlements/${p.body.settlement.id}/admin-override`, { status: 'CONFIRMED' })).status).toBe(400);
    const o = await c.as('admin').post(`/settlements/${p.body.settlement.id}/admin-override`, { status: 'CONFIRMED', adminNote: 'Verified bank statement' });
    expect(o.body.settlement.status).toBe('CONFIRMED');
    const log = c.db.prepare(`SELECT * FROM audit_logs WHERE action='ADMIN_OVERRIDE' AND entity_type='SETTLEMENT'`).get() as any;
    expect(JSON.parse(log.previous_state).status).toBe('DISPUTED');
    expect(JSON.parse(log.metadata).reason).toBe('Verified bank statement');
  });
  it('settlement amounts equal ledger sum (money conserved)', async () => {
    const e = await c.event();
    for (const [who, amt, ppl] of [['alice', 90000, ['alice', 'bob', 'carol']], ['bob', 61000, ['alice', 'bob', 'dave']], ['carol', 12345, ['carol', 'dave']]] as const) {
      const x = (await c.expense(who, { eventId: e, title: 'E' + amt, amountPaise: amt, participants: eq(...ppl)(c.ids) })).body.expense;
      for (const p of ppl) if (p !== who) await c.as(p).post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    }
    const s = (await c.as('alice').get(`/events/${e}/settlement`)).body;
    expect(s.balances.reduce((a: number, b: any) => a + b.netPaise, 0)).toBe(0);
    const moved = s.suggestions.reduce((a: number, t: any) => a + t.amountPaise, 0);
    const credit = s.balances.filter((b: any) => b.netPaise > 0).reduce((a: number, b: any) => a + b.netPaise, 0);
    expect(moved).toBe(credit);
  });
});

describe('notifications & admin visibility', () => {
  it('notification center: unread count, mark read, mark all', async () => {
    const e = await c.event();
    await c.expense('alice', { eventId: e, participants: eq('alice', 'bob')(c.ids) });
    const list = (await c.as('bob').get('/notifications')).body;
    expect(list.unreadCount).toBeGreaterThan(0);
    await c.as('bob').post(`/notifications/${list.notifications[0].id}/read`);
    expect((await c.as('bob').get('/notifications/unread-count')).body.unreadCount).toBe(list.unreadCount - 1);
    await c.as('bob').post('/notifications/read-all');
    expect((await c.as('bob').get('/notifications/unread-count')).body.unreadCount).toBe(0);
  });
  it('admin sees dashboard, audit, errors, health; users can report problems; admin triages', async () => {
    const e = await c.event();
    await c.expense('alice', { eventId: e, participants: eq('alice', 'bob')(c.ids) });
    const dash = (await c.as('admin').get('/admin/dashboard')).body;
    expect(dash.users.total).toBe(6); expect(dash.events.active).toBe(1); expect(dash.expenses.pendingApproval).toBe(1);
    expect((await c.as('admin').get('/admin/audit?action=EXPENSE_CREATED')).body.total).toBe(1);
    expect((await c.as('admin').get('/admin/health')).body.status).toBe('HEALTHY');
    const pr = await c.as('bob').post('/problems', { title: 'App crashed', description: 'It crashed when I opened trips' });
    expect(pr.status).toBe(201);
    const list = (await c.as('admin').get('/admin/problems')).body.problems;
    expect(list).toHaveLength(1);
    const upd = await c.as('admin').patch(`/admin/problems/${list[0].id}`, { status: 'RESOLVED', adminNote: 'Fixed' });
    expect(upd.body.problem.status).toBe('RESOLVED');
    expect((await c.as('bob').get('/notifications?type=PROBLEM_UPDATE')).body.notifications).toHaveLength(1);
  });
  it('unexpected server errors are logged to system_errors and return a safe message', async () => {
    c.db.exec(`DROP TABLE hackathon_details`);
    const r = await c.as('admin').post('/events', { name: 'X', type: 'HACKATHON', startDate: '2026-01-01', endDate: '2026-01-02' });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/SQLITE|stack|hackathon_details/i);
    const errs = (await c.as('admin').get('/admin/errors')).body.errors;
    expect(errs.length).toBe(1);
    expect(errs[0].source).toBe('database');
  });
  it('event report: financial summary, budget vs actual, CSV export', async () => {
    const e = await c.event({ budgets: { FOOD: 100000 } });
    const x = (await c.expense('alice', { eventId: e, amountPaise: 30000, participants: eq('alice', 'bob')(c.ids) })).body.expense;
    await c.as('bob').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    const rep = (await c.as('admin').get(`/admin/reports/event/${e}`)).body;
    expect(rep.financial.totalPaise).toBe(30000);
    expect(rep.budgetVsActual[0]).toMatchObject({ category: 'FOOD', budgetPaise: 100000, actualPaise: 30000 });
    const csv = await c.as('admin').get(`/admin/reports/event/${e}?format=csv`);
    expect(csv.text.split('\n')[0]).toContain('net_inr');
  });
  it('user dashboard totals', async () => {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, amountPaise: 30000, participants: eq('alice', 'bob', 'carol')(c.ids) })).body.expense;
    await c.as('bob').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    const d = (await c.as('bob').get('/dashboard/me')).body;
    expect(d.owedPaise).toBe(10000); expect(d.pendingApprovals).toBe(0);
    const a = (await c.as('alice').get('/dashboard/me')).body;
    expect(a.receivablePaise).toBe(10000); expect(a.totalSpentPaise).toBe(30000); expect(a.trips.total).toBe(1);
  });
});
