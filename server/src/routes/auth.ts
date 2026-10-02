import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../db.js';
import {
  requireAuth, verifyPassword, hashPassword, signToken, validatePasswordStrength,
  throttleCheck, throttleFail, throttleClear,
} from '../auth.js';
import { AppError, unauthorized } from '../errors.js';
import { audit, notifyAdmins, camel } from '../helpers.js';
import { parse, optStr } from '../validate.js';

export const publicUser = (u: any) => {
  const c = camel(u);
  delete c.passwordHash; delete c.tokenVersion;
  c.mustChangePassword = !!c.mustChangePassword;
  return c;
};

export function authRouter(db: DB) {
  const r = Router();

  r.post('/login', (req, res) => {
    const { username, password } = parse(z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) }), req.body);
    const key = `${req.ip}|${username.toLowerCase()}`;
    throttleCheck(key);
    const u = db.prepare(`SELECT * FROM users WHERE username=?`).get(username) as any;
    // Constant-ish work whether or not the user exists
    const ok = u ? verifyPassword(password, u.password_hash) : (verifyPassword(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali'), false);
    if (!ok || u.status !== 'ACTIVE') {
      throttleFail(key);
      audit(db, null, 'LOGIN_FAILED', 'USER', u?.id ?? null, { metadata: { username, reason: !u ? 'unknown_user' : !ok ? 'bad_password' : 'inactive' } });
      const recent = (db.prepare(`SELECT COUNT(*) c FROM audit_logs WHERE action='LOGIN_FAILED' AND metadata LIKE ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 minutes')`)
        .get(`%"username":${JSON.stringify(username)}%`) as any).c;
      if (recent === 5) notifyAdmins(db, { type: 'AUTH_SUSPICIOUS', level: 'WARNING', title: `Repeated failed logins for "${username}"`, body: '5 failed attempts in 15 minutes.' });
      throw unauthorized(u && u.status !== 'ACTIVE' ? 'This account is not active. Contact your admin.' : 'Invalid username or password');
    }
    throttleClear(key);
    audit(db, { id: u.id, name: u.name, role: u.role }, 'LOGIN', 'USER', u.id);
    res.json({ token: signToken(u), user: publicUser(u) });
  });

  r.use(requireAuth(db));

  r.get('/me', (req, res) => {
    const u = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user!.id);
    res.json({ user: publicUser(u) });
  });

  r.post('/logout', (req, res) => {
    audit(db, req.user!, 'LOGOUT', 'USER', req.user!.id);
    res.json({ ok: true });
  });

  r.post('/change-password', (req, res) => {
    const { currentPassword, newPassword } = parse(z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1).max(200) }), req.body);
    const u = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user!.id) as any;
    if (!verifyPassword(currentPassword, u.password_hash)) throw new AppError(400, 'Current password is incorrect', 'BAD_PASSWORD');
    validatePasswordStrength(newPassword);
    if (newPassword === currentPassword) throw new AppError(400, 'New password must be different');
    db.prepare(`UPDATE users SET password_hash=?, must_change_password=0, token_version=token_version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
      .run(hashPassword(newPassword), u.id);
    audit(db, req.user!, 'PASSWORD_CHANGED', 'USER', u.id);
    const fresh = db.prepare(`SELECT * FROM users WHERE id=?`).get(u.id) as any;
    res.json({ token: signToken(fresh), user: publicUser(fresh) }); // other sessions are invalidated
  });

  // Self-service profile: only non-identity fields (name/username/role/status are admin-managed).
  r.patch('/profile', (req, res) => {
    const d = parse(z.object({
      email: z.string().email().max(200).optional().nullable(), phone: optStr(20), college: optStr(200),
      department: optStr(100), year: optStr(20), emergencyContact: optStr(200),
    }).strict(), req.body);
    const cur = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user!.id) as any;
    const next = {
      email: d.email !== undefined ? d.email : cur.email, phone: d.phone !== undefined ? d.phone : cur.phone, college: d.college !== undefined ? d.college : cur.college,
      department: d.department !== undefined ? d.department : cur.department, year: d.year !== undefined ? d.year : cur.year,
      emergency_contact: d.emergencyContact !== undefined ? d.emergencyContact : cur.emergency_contact,
    };
    db.transaction(() => {
      db.prepare(`UPDATE users SET email=?, phone=?, college=?, department=?, year=?, emergency_contact=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
        .run(next.email, next.phone, next.college, next.department, next.year, next.emergency_contact, cur.id);
      audit(db, req.user!, 'PROFILE_UPDATED', 'USER', cur.id, { previous: { email: cur.email, phone: cur.phone, college: cur.college, department: cur.department, year: cur.year }, next });
    })();
    res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(cur.id)) });
  });

  return r;
}
