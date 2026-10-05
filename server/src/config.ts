import path from 'node:path';
import crypto from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');
if (isProd && !process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set in production');

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  // Dev/test fallback is random per process (tokens die on restart) unless JWT_SECRET is provided.
  jwtSecret: process.env.JWT_SECRET ?? crypto.randomBytes(32).toString('hex'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  // Production: postgres://... (Neon). Local dev: a folder used by embedded Postgres (PGlite).
  databaseUrl: process.env.DATABASE_URL ?? path.resolve(process.cwd(), 'data', 'pglite'),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 4 * 1024 * 1024),
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  bcryptCost: Number(process.env.BCRYPT_COST ?? 10),
  // One-time bootstrap (production): creates the first admin if the users table is empty.
  bootstrapAdmin: process.env.BOOTSTRAP_ADMIN_USERNAME && process.env.BOOTSTRAP_ADMIN_PASSWORD
    ? { username: process.env.BOOTSTRAP_ADMIN_USERNAME, password: process.env.BOOTSTRAP_ADMIN_PASSWORD, name: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Admin' } : null,
  seedDemo: process.env.SEED_DEMO === 'true',
};
