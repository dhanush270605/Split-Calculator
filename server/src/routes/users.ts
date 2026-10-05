import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db.js';
import { requireAuth, requireAdmin, hashPassword, generateTempPassword, validatePasswordStrength } from '../auth.js';
import { AppError, conflict, notFound } from '../errors.js';
import { audit, notify, notifyAdmins, camelAll } from '../helpers.js';
import { parse, optStr, intQuery } from '../validate.js';
import { publicUser } from './auth.js';

const userFields = {
  name: z.string().trim().min(1).max(120),
  email: z.string().email().max(200).optional().nullable(),
  phone: optStr(20), college: optStr(200), department: optStr(100), year: optStr(20),
  emergencyContact: optStr(200), notes: optStr(1000),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
};

export function usersRouter(db: DB) {
  const r = Router();
  r.use(requireAuth(db));

  r.get('/', requireAdmin, async (req, res) => {
    const q = `%${String(req.query.search ?? '').trim()}%`;
    const status = req.query.status ? String(req.query.status) : null;
    const limit = intQuery(req.query.limit, 100, 1, 500), offset = intQuery(req.query.offset, 0, 0, 1e6);
    const rows = await db.all(
      `SELECT * FROM users WHERE (name LIKE ? OR username LIKE ? OR email LIKE ? OR college LIKE ?) AND (? IS NULL OR status=?) ORDER BY name LIMIT ? OFFSET ?`,
      q, q, q, q, status, status, limit, offset);
    res.json({ users: rows.map(publicUser) });
  });

  r.post('/', requireAdmin, async (req, res) => {
    const d = parse(z.object({ username: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9._-]+$/, 'may only contain letters, digits . _ -'), password: z.string().max(200).optional(), ...userFields }), req.body);
    if (await db.get(`SELECT 1 x FROM users WHERE lower(username)=lower(?)`, d.username)) throw conflict('That username is already taken');
    let temp: string | null = null;
    let pw = d.password;
    if (pw) validatePasswordStrength(pw);
    else pw = temp = generateTempPassword();
    const id = await db.tx(async () => {
      const uid = await db.insert(
        `INSERT INTO users (username,name,email,phone,college,department,year,emergency_contact,notes,role,password_hash,must_change_password) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
        d.username, d.name, d.email ?? null, d.phone ?? null, d.college ?? null, d.department ?? null, d.year ?? null, d.emergencyContact ?? null, d.notes ?? null, d.role, hashPassword(pw!));
      await audit(db, req.user!, 'USER_CREATED', 'USER', uid, { metadata: { username: d.username, role: d.role } });
      await notifyAdmins(db, { type: 'USER_CREATED', title: `New user: ${d.name}`, body: `Created by ${req.user!.name}`, entityType: 'USER', entityId: uid }, req.user!.id);
      await notify(db, [uid], { type: 'WELCOME', level: 'INFO', title: 'Welcome to Split Calculator', body: 'Your account was created by an admin. Please set a new password.' });
      return uid;
    });
    res.status(201).json({ user: publicUser(await db.get(`SELECT * FROM users WHERE id=?`, id)), temporaryPassword: temp });
  });

  r.get('/:id', requireAdmin, async (req, res) => {
    const u = await db.get(`SELECT * FROM users WHERE id=?`, Number(req.params.id));
    if (!u) throw notFound('User not found');
    res.json({ user: publicUser(u) });
  });

  r.patch('/:id', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const d = parse(z.object({ ...userFields, role: z.enum(['ADMIN', 'USER']).optional() }).partial().strict(), req.body);
    const cur = await db.get<any>(`SELECT * FROM users WHERE id=?`, id);
    if (!cur) throw notFound('User not found');
    if (d.role && d.role !== cur.role && id === req.user!.id) throw new AppError(400, 'You cannot change your own role');
    const pick = (a: any, b: any) => (a !== undefined ? a : b);
    const next = {
      name: pick(d.name, cur.name), email: pick(d.email, cur.email), phone: pick(d.phone, cur.phone), college: pick(d.college, cur.college),
      department: pick(d.department, cur.department), year: pick(d.year, cur.year), emergency_contact: pick(d.emergencyContact, cur.emergency_contact),
      notes: pick(d.notes, cur.notes), role: pick(d.role, cur.role),
    };
    await db.tx(async () => {
      await db.run(`UPDATE users SET name=?,email=?,phone=?,college=?,department=?,year=?,emergency_contact=?,notes=?,role=?,token_version=token_version+?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
        next.name, next.email, next.phone, next.college, next.department, next.year, next.emergency_contact, next.notes, next.role, next.role !== cur.role ? 1 : 0, id);
      await audit(db, req.user!, 'USER_UPDATED', 'USER', id, { previous: { name: cur.name, role: cur.role, college: cur.college }, next: { name: next.name, role: next.role, college: next.college } });
      await notifyAdmins(db, { type: 'USER_UPDATED', title: `User updated: ${next.name}`, body: `by ${req.user!.name}`, entityType: 'USER', entityId: id }, req.user!.id);
    });
    res.json({ user: publicUser(await db.get(`SELECT * FROM users WHERE id=?`, id)) });
  });

  r.post('/:id/status', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const { status } = parse(z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']) }), req.body);
    const cur = await db.get<any>(`SELECT * FROM users WHERE id=?`, id);
    if (!cur) throw notFound('User not found');
    if (id === req.user!.id && status !== 'ACTIVE') throw new AppError(400, 'You cannot deactivate your own account');
    await db.tx(async () => {
      await db.run(`UPDATE users SET status=?, token_version=token_version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`, status, id);
      await audit(db, req.user!, 'USER_STATUS_CHANGED', 'USER', id, { previous: { status: cur.status }, next: { status } });
    });
    res.json({ user: publicUser(await db.get(`SELECT * FROM users WHERE id=?`, id)) });
  });

  r.post('/:id/reset-password', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const cur = await db.get(`SELECT id FROM users WHERE id=?`, id);
    if (!cur) throw notFound('User not found');
    const temp = generateTempPassword();
    await db.tx(async () => {
      await db.run(`UPDATE users SET password_hash=?, must_change_password=1, token_version=token_version+1 WHERE id=?`, hashPassword(temp), id);
      await audit(db, req.user!, 'PASSWORD_RESET', 'USER', id); // the password itself is never logged
    });
    res.json({ temporaryPassword: temp });
  });

  r.get('/:id/activity', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const u = await db.get(`SELECT * FROM users WHERE id=?`, id);
    if (!u) throw notFound('User not found');
    const activity = await db.all(`SELECT id, action, entity_type, entity_id, event_id, created_at, metadata FROM audit_logs WHERE actor_id=? ORDER BY id DESC LIMIT 100`, id);
    const expenses = await db.all(`SELECT id, title, amount_paise, status, visibility, event_id, created_at FROM expenses WHERE creator_id=? OR payer_user_id=? ORDER BY id DESC LIMIT 50`, id, id);
    const settlements = await db.all(`SELECT * FROM settlements WHERE from_user_id=? OR to_user_id=? ORDER BY id DESC LIMIT 50`, id, id);
    const events = await db.all(`SELECT e.id, e.name, e.type, e.status, ep.status membership FROM event_participants ep JOIN events e ON e.id=ep.event_id WHERE ep.user_id=?`, id);
    res.json({ user: publicUser(u), activity: camelAll(activity), expenses: camelAll(expenses), settlements: camelAll(settlements), events: camelAll(events) });
  });

  return r;
}
