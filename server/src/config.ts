import path from 'node:path';
import crypto from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  // Dev/test fallback is random per process (tokens die on restart) unless JWT_SECRET is provided.
  jwtSecret: process.env.JWT_SECRET ?? crypto.randomBytes(32).toString('hex'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  dbPath: process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'splitcalc.db'),
  uploadDir: process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'data', 'uploads'),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  bcryptCost: Number(process.env.BCRYPT_COST ?? 10),
};
