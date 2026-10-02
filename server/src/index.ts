import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';

const db = openDb(config.dbPath);
const hasAdmin = (db.prepare(`SELECT COUNT(*) c FROM users WHERE role='ADMIN'`).get() as any).c;
if (!hasAdmin) console.warn('[warn] No users exist. Run "npm run seed" for demo data, or "npm run create-admin" to create the first admin.');
const app = createApp(db);
app.listen(config.port, '0.0.0.0', () => console.log(`Split Calculator API listening on http://localhost:${config.port}`));
