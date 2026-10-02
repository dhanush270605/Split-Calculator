import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import type { DB } from './db.js';
import { forbidden, unauthorized, AppError } from './errors.js';
import type { Actor } from './helpers.js';

export interface AuthUser extends Actor {
  username: string;
  mustChangePassword: boolean;
}
declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

export const hashPassword = (pw: string) => bcrypt.hashSync(pw, config.bcryptCost);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compareSync(pw, hash);

export function validatePasswordStrength(pw: string) {
  if (pw.length < 8) throw new AppError(400, 'Password must be at least 8 characters', 'WEAK_PASSWORD');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new AppError(400, 'Password must contain letters and digits', 'WEAK_PASSWORD');
}

/** Cryptographically random temporary password (shown once to the admin). */
export function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  const bytes = crypto.randomBytes(10);
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s + '7a';
}

export function signToken(user: { id: number; token_version: number }) {
  return jwt.sign({ sub: user.id, tv: user.token_version }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

const ALLOWED_WHILE_MUST_CHANGE = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']);

export function requireAuth(db: DB) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw unauthorized();
    let payload: any;
    try {
      payload = jwt.verify(h.slice(7), config.jwtSecret);
    } catch {
      throw unauthorized('Session expired. Please sign in again.');
    }
    const u = db.prepare(`SELECT id,name,username,role,status,token_version,must_change_password FROM users WHERE id=?`).get(payload.sub) as any;
    if (!u || u.status !== 'ACTIVE' || u.token_version !== payload.tv) throw unauthorized('Session expired. Please sign in again.');
    req.user = { id: u.id, name: u.name, username: u.username, role: u.role, mustChangePassword: !!u.must_change_password };
    if (req.user.mustChangePassword && !ALLOWED_WHILE_MUST_CHANGE.has(req.originalUrl.split('?')[0])) {
      throw new AppError(403, 'You must change your temporary password first', 'MUST_CHANGE_PASSWORD');
    }
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') throw forbidden('Admin access required');
  next();
}

/** Simple in-memory login throttle: 8 failures / 15 min per (ip, username). */
const fails = new Map<string, { n: number; first: number }>();
const WINDOW = 15 * 60_000;
const MAX_FAILS = 8;
export function throttleCheck(key: string) {
  const f = fails.get(key);
  if (f && Date.now() - f.first < WINDOW && f.n >= MAX_FAILS) {
    throw new AppError(429, 'Too many failed attempts. Try again in a few minutes.', 'TOO_MANY_ATTEMPTS');
  }
}
export function throttleFail(key: string) {
  const f = fails.get(key);
  if (!f || Date.now() - f.first >= WINDOW) fails.set(key, { n: 1, first: Date.now() });
  else f.n++;
}
export const throttleClear = (key: string) => fails.delete(key);
export const _resetThrottle = () => fails.clear();
