import request from 'supertest';
import { openDb, type DB } from '../src/db.js';
import { createApp } from '../src/app.js';
import { createBootstrapAdmin } from '../src/seed.js';
import { _resetThrottle } from '../src/auth.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.BCRYPT_COST = '4';

export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export interface Ctx {
  db: DB;
  api: ReturnType<typeof request>;
  tokens: Record<string, string>;
  ids: Record<string, number>;
  as: (who: string) => {
    get: (p: string) => request.Test; post: (p: string, b?: any) => request.Test; patch: (p: string, b?: any) => request.Test; del: (p: string) => request.Test;
  };
  user: (username: string, extra?: any) => Promise<number>;
  event: (extra?: any) => Promise<number>;
  expense: (who: string, body: any) => Promise<any>;
}

let counter = 0;
export async function makeCtx(users: string[] = ['alice', 'bob', 'carol', 'dave', 'outsider']): Promise<Ctx> {
  _resetThrottle();
  const db = openDb(':memory:');
  createBootstrapAdmin(db, { username: 'admin', password: 'Admin@1234', name: 'Admin' });
  const app = createApp(db);
  const api = request(app);
  const tokens: Record<string, string> = {};
  const ids: Record<string, number> = {};
  const login = async (u: string, p: string) => { const r = await api.post('/api/auth/login').send({ username: u, password: p }); tokens[u] = r.body.token; return r; };
  await login('admin', 'Admin@1234');
  const as = (who: string) => ({
    get: (p: string) => api.get('/api' + p).set('Authorization', `Bearer ${tokens[who]}`),
    post: (p: string, b: any = {}) => api.post('/api' + p).set('Authorization', `Bearer ${tokens[who]}`).send(b),
    patch: (p: string, b: any = {}) => api.patch('/api' + p).set('Authorization', `Bearer ${tokens[who]}`).send(b),
    del: (p: string) => api.delete('/api' + p).set('Authorization', `Bearer ${tokens[who]}`),
  });
  const user = async (username: string, extra: any = {}) => {
    const r = await as('admin').post('/users', { username, name: username[0].toUpperCase() + username.slice(1), password: 'Passw0rd!', ...extra });
    if (r.status !== 201) throw new Error('user create failed ' + JSON.stringify(r.body));
    ids[username] = r.body.user.id;
    db.prepare(`UPDATE users SET must_change_password=0 WHERE id=?`).run(r.body.user.id);
    await login(username, 'Passw0rd!');
    return r.body.user.id as number;
  };
  for (const u of users) await user(u);
  const event = async (extra: any = {}) => {
    const r = await as('admin').post('/events', {
      name: 'Test Event ' + ++counter, type: 'TRIP', startDate: '2026-10-01', endDate: '2026-10-05', status: 'ACTIVE',
      participantIds: [ids.alice, ids.bob, ids.carol, ids.dave], ...extra,
    });
    if (r.status !== 201) throw new Error('event create failed ' + JSON.stringify(r.body));
    return r.body.event.id as number;
  };
  let k = 0;
  const expense = async (who: string, body: any) => {
    const r = await as(who).post('/expenses', {
      title: 'Lunch', category: 'FOOD', amountPaise: 30000, paymentMethod: 'UPI', spentAt: new Date().toISOString(), idempotencyKey: `test-key-${++k}-${Date.now()}`, ...body,
    });
    return r;
  };
  return { db, api, tokens, ids, as, user, event, expense };
}

export const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'splitcalc-'));
