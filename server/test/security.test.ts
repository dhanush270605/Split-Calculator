import { describe, it, expect, beforeEach } from 'vitest';
import { makeCtx, PNG, type Ctx } from './kit.js';
import { detectFileType } from '../src/routes/misc.js';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';

let c: Ctx;
beforeEach(async () => { c = await makeCtx(); });
const ids = (...n: string[]) => n.map((u) => ({ userId: c.ids[u] }));

describe('authentication & account creation', () => {
  it('rejects unauthenticated and garbage tokens', async () => {
    expect((await c.api.get('/api/events')).status).toBe(401);
    expect((await c.api.get('/api/events').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
  });
  it('there is no public registration; normal users cannot create accounts', async () => {
    expect([401, 404]).toContain((await c.api.post('/api/auth/register').send({ username: 'x', password: 'Passw0rd!' })).status);
    expect(c.db.prepare(`SELECT 1 FROM users WHERE username='x'`).get()).toBeUndefined();
    expect((await c.api.post('/api/users').send({ username: 'evil', name: 'Evil', password: 'Passw0rd!' })).status).toBe(401);
    const r = await c.as('alice').post('/users', { username: 'evil', name: 'Evil', password: 'Passw0rd!', role: 'ADMIN' });
    expect(r.status).toBe(403);
    expect(c.db.prepare(`SELECT 1 FROM users WHERE username='evil'`).get()).toBeUndefined();
  });
  it('role is read from the database, not from the token or request (no privilege escalation)', async () => {
    // a user cannot promote themselves through profile update
    const r = await c.as('alice').patch('/auth/profile', { role: 'ADMIN' });
    expect(r.status).toBe(400);
    expect((c.db.prepare(`SELECT role FROM users WHERE username='alice'`).get() as any).role).toBe('USER');
    // demoting an admin in the DB takes effect immediately on the next request
    c.db.prepare(`UPDATE users SET role='USER' WHERE username='admin'`).run();
    expect((await c.as('admin').get('/admin/dashboard')).status).toBe(403);
  });
  it('login throttling after repeated failures', async () => {
    for (let i = 0; i < 8; i++) await c.api.post('/api/auth/login').send({ username: 'alice', password: 'wrong' + i });
    const r = await c.api.post('/api/auth/login').send({ username: 'alice', password: 'Passw0rd!' });
    expect(r.status).toBe(429);
    expect((c.db.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE action='LOGIN_FAILED'`).get() as any).c).toBe(8);
  });
  it('audit logs and error rows never contain passwords', async () => {
    await c.api.post('/api/auth/login').send({ username: 'alice', password: 'SuperSecretGuess1' });
    const rows = JSON.stringify(c.db.prepare(`SELECT * FROM audit_logs`).all());
    expect(rows).not.toContain('SuperSecretGuess1');
    expect(rows).not.toContain('Passw0rd!');
  });
  it('audit log is immutable', () => {
    c.db.prepare(`INSERT INTO audit_logs (action) VALUES ('X')`).run();
    expect(() => c.db.prepare(`UPDATE audit_logs SET action='Y'`).run()).toThrow(/immutable/);
    expect(() => c.db.prepare(`DELETE FROM audit_logs`).run()).toThrow(/immutable/);
  });
});

describe('admin authorization is enforced by the backend', () => {
  const adminRoutes = ['/admin/dashboard', '/admin/audit', '/admin/errors', '/admin/health', '/admin/problems', '/users', '/disputes'];
  it('normal users get 403 on every admin endpoint', async () => {
    for (const r of adminRoutes) expect((await c.as('alice').get(r)).status, r).toBe(403);
    expect((await c.as('alice').post('/events', { name: 'X', type: 'TRIP', startDate: '2026-01-01', endDate: '2026-01-02' })).status).toBe(403);
    const e = await c.event();
    expect((await c.as('alice').patch(`/events/${e}`, { name: 'hacked' })).status).toBe(403);
    expect((await c.as('alice').post(`/events/${e}/participants`, { userIds: [c.ids.outsider] })).status).toBe(403);
    expect((await c.as('alice').post(`/users/${c.ids.bob}/reset-password`)).status).toBe(403);
    expect((await c.as('alice').post(`/users/${c.ids.bob}/status`, { status: 'INACTIVE' })).status).toBe(403);
    expect((await c.as('alice').get(`/admin/reports/event/${e}`)).status).toBe(403);
    expect((await c.as('alice').post('/notifications/broadcast', { eventId: e, title: 'spam' })).status).toBe(403);
  });
  it('admin can access all administrative data', async () => {
    for (const r of adminRoutes) expect((await c.as('admin').get(r)).status, r).toBe(200);
  });
  it('admin cannot demote or deactivate themself', async () => {
    expect((await c.as('admin').post(`/users/${(c.db.prepare(`SELECT id FROM users WHERE username='admin'`).get() as any).id}/status`, { status: 'INACTIVE' })).status).toBe(400);
  });
});

describe('event & expense isolation', () => {
  it('non-participants cannot read or write inside an event', async () => {
    const e = await c.event();
    expect((await c.as('outsider').get(`/events/${e}`)).status).toBe(404);
    expect((await c.as('outsider').get(`/events/${e}/settlement`)).status).toBe(404);
    expect((await c.as('outsider').get(`/events/${e}/timeline`)).status).toBe(404);
    expect((await c.as('outsider').get(`/expenses?eventId=${e}`)).status).toBe(404);
    expect((await c.expense('outsider', { eventId: e, participants: ids('outsider') })).status).toBe(404);
    expect((await c.as('outsider').post('/settlements', { eventId: e, toUserId: c.ids.alice, amountPaise: 100 })).status).toBe(404);
  });
  it('cannot add non-event users (or unknown users) as expense participants or payer', async () => {
    const e = await c.event();
    expect((await c.expense('alice', { eventId: e, participants: ids('alice', 'outsider') })).status).toBe(400);
    expect((await c.expense('alice', { eventId: e, participants: [{ userId: 424242 }] })).status).toBe(400);
    expect((await c.expense('alice', { eventId: e, payerType: 'GROUP_MEMBER', payerUserId: c.ids.outsider, participants: ids('alice') })).status).toBe(400);
    expect((await c.expense('alice', { eventId: e, payerType: 'INDIVIDUAL', payerUserId: c.ids.bob, participants: ids('alice') })).status).toBe(400); // cannot claim someone else paid without GROUP_MEMBER flow
  });
  it('removed participants cannot be added to new expenses and lose access to creating', async () => {
    const e = await c.event();
    await c.as('admin').del(`/events/${e}/participants/${c.ids.dave}`);
    expect((await c.expense('alice', { eventId: e, participants: ids('alice', 'dave') })).status).toBe(400);
    expect((await c.expense('dave', { eventId: e, participants: ids('dave') })).status).toBe(403);
  });
  it('private expenses are hidden from everyone uninvolved at the backend (detail, list, timeline, activity, attachments)', async () => {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, title: 'Secret gift', visibility: 'PRIVATE', privateReason: 'Surprise', participants: ids('alice', 'bob') })).body.expense;
    const upl = await c.api.post('/api/attachments').set('Authorization', `Bearer ${c.tokens.alice}`).field('entityType', 'EXPENSE').field('entityId', String(x.id)).attach('file', PNG, 'proof.png');
    expect(upl.status).toBe(201);
    // carol & dave are event members but not involved
    for (const who of ['carol', 'dave']) {
      expect((await c.as(who).get(`/expenses/${x.id}`)).status).toBe(404);
      expect((await c.as(who).get(`/expenses?eventId=${e}`)).body.expenses.find((r: any) => r.id === x.id)).toBeUndefined();
      expect((await c.as(who).get(`/expenses?search=Secret`)).body.total).toBe(0);
      expect((await c.as(who).get(`/events/${e}/timeline`)).body.timeline.find((t: any) => t.title === 'Secret gift')).toBeUndefined();
      expect(JSON.stringify((await c.as(who).get(`/events/${e}/activity`)).body)).not.toContain(String(x.id) === '' ? '' : 'Secret');
      expect((await c.as(who).get(`/attachments/${upl.body.attachment.id}`)).status).toBe(404);
      expect((await c.as(who).post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' })).status).toBe(404);
      expect((await c.as(who).post(`/expenses/${x.id}/dispute`, { reason: 'nosy' })).status).toBe(404);
      expect((await c.as(who).patch(`/expenses/${x.id}`, { expectedVersion: 1, title: 'x' })).status).toBe(404);
      const activity = (await c.as(who).get(`/events/${e}/activity`)).body.activity;
      expect(activity.some((a: any) => a.entityType === 'EXPENSE' && a.entityId === x.id)).toBe(false);
    }
    // the dashboards/summary of uninvolved users don't leak amounts of private items
    expect((await c.as('carol').get('/dashboard/me')).body.recentExpenses.find((r: any) => r.id === x.id)).toBeUndefined();
    // involved + admin can see it, including the private reason
    expect((await c.as('bob').get(`/expenses/${x.id}`)).body.expense.privateReason).toBe('Surprise');
    expect((await c.as('alice').get(`/expenses/${x.id}`)).status).toBe(200);
    const adm = await c.as('admin').get(`/expenses/${x.id}`);
    expect(adm.status).toBe(200);
    expect((await c.as('admin').get(`/attachments/${upl.body.attachment.id}`)).status).toBe(200);
    expect((await c.as('bob').get(`/attachments/${upl.body.attachment.id}`)).status).toBe(200);
  });
  it('making an expense private revokes access immediately', async () => {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, participants: ids('alice') })).body.expense;
    expect((await c.as('carol').get(`/expenses/${x.id}`)).status).toBe(200);
    await c.as('alice').patch(`/expenses/${x.id}`, { expectedVersion: x.version, visibility: 'PRIVATE', privateReason: 'changed my mind' });
    expect((await c.as('carol').get(`/expenses/${x.id}`)).status).toBe(404);
  });
  it('users cannot modify, cancel or approve other people\'s expenses', async () => {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, participants: ids('alice', 'bob') })).body.expense;
    expect((await c.as('bob').patch(`/expenses/${x.id}`, { expectedVersion: x.version, amountPaise: 1 })).status).toBe(403);
    expect((await c.as('bob').post(`/expenses/${x.id}/cancel`)).status).toBe(403);
    // carol is not a participant of this expense -> may see it (public) but cannot respond on someone's behalf
    expect((await c.as('carol').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' })).status).toBe(403);
    expect((await c.as('carol').post(`/expenses/${x.id}/dispute`, { reason: 'not involved' })).status).toBe(403);
    // bob cannot approve twice on behalf of alice either: alice's own share is already approved; bob only controls bob's
    await c.as('bob').post(`/expenses/${x.id}/respond`, { decision: 'DECLINE' });
    const detail = (await c.as('alice').get(`/expenses/${x.id}`)).body.expense;
    expect(detail.allocations.find((a: any) => a.userId === c.ids.alice).approvalStatus).toBe('APPROVED');
  });
  it('settlements: only the receiver confirms; outsiders cannot even see them', async () => {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, amountPaise: 20000, participants: ids('alice', 'bob') })).body.expense;
    await c.as('bob').post(`/expenses/${x.id}/respond`, { decision: 'APPROVE' });
    const p = (await c.as('bob').post('/settlements', { eventId: e, toUserId: c.ids.alice, amountPaise: 10000 })).body.settlement;
    expect((await c.as('carol').post(`/settlements/${p.id}/confirm`)).status).toBe(404);
    expect((await c.as('bob').post(`/settlements/${p.id}/confirm`)).status).toBe(403);
    expect((await c.as('carol').get('/settlements')).body.settlements).toHaveLength(0);
    expect((await c.as('bob').post('/settlements', { eventId: e, fromUserId: c.ids.carol, toUserId: c.ids.alice, amountPaise: 100 })).status).toBe(403);
    expect((await c.as('bob').post(`/settlements/${p.id}/admin-override`, { status: 'CONFIRMED', adminNote: 'trust me' })).status).toBe(403);
  });
  it('SQL-injection style input is treated as data', async () => {
    const e = await c.event();
    await c.expense('alice', { eventId: e, participants: ids('alice') });
    const r = await c.as('alice').get(`/expenses?search=${encodeURIComponent("' OR 1=1; DROP TABLE expenses;--")}`);
    expect(r.status).toBe(200); expect(r.body.total).toBe(0);
    expect((c.db.prepare(`SELECT COUNT(*) c FROM expenses`).get() as any).c).toBe(1);
    expect((await c.api.post('/api/auth/login').send({ username: "admin' --", password: 'x' })).status).toBe(401);
  });
});

describe('file upload security', () => {
  it('detects real file types by magic bytes', () => {
    expect(detectFileType(PNG)?.mime).toBe('image/png');
    expect(detectFileType(Buffer.from('%PDF-1.7 ...'))?.mime).toBe('application/pdf');
    expect(detectFileType(Buffer.from('<?php echo 1; ?>'))).toBeNull();
    expect(detectFileType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
  });
  async function upload(who: string, expenseId: number, buf: Buffer, name: string) {
    return c.api.post('/api/attachments').set('Authorization', `Bearer ${c.tokens[who]}`).field('entityType', 'EXPENSE').field('entityId', String(expenseId)).attach('file', buf, name);
  }
  it('rejects disguised files, oversize files and uploads to others\' expenses; sanitises names', async () => {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, participants: ids('alice') })).body.expense;
    expect((await upload('alice', x.id, Buffer.from('<script>alert(1)</script>'), 'evil.png')).status).toBe(400);
    expect((await upload('alice', x.id, Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]), 'big.png')).status).toBe(413);
    expect((await upload('bob', x.id, PNG, 'mine.png')).status).toBe(403);
    expect((await upload('outsider', x.id, PNG, 'mine.png')).status).toBe(404);
    const ok = await upload('alice', x.id, PNG, '../../etc/passwd.png');
    expect(ok.status).toBe(201);
    const row = c.db.prepare(`SELECT * FROM attachments WHERE id=?`).get(ok.body.attachment.id) as any;
    expect(row.stored_name).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(row.original_name).not.toContain('/');
    expect(fs.existsSync(path.join(config.uploadDir, row.stored_name))).toBe(true);
    const dl = await c.as('alice').get(`/attachments/${ok.body.attachment.id}`);
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect((await c.api.get(`/api/attachments/${ok.body.attachment.id}`)).status).toBe(401);
  });
  it('failed uploads are logged for admins', async () => {
    const e = await c.event();
    const x = (await c.expense('alice', { eventId: e, participants: ids('alice') })).body.expense;
    await upload('alice', x.id, Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]), 'big.png');
    const errs = (await c.as('admin').get('/admin/errors?source=upload')).body.errors;
    expect(errs.length).toBeGreaterThan(0);
  });
});
