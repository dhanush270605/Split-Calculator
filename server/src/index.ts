import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { createBootstrapAdmin, seedDemo } from './seed.js';

async function main() {
  const db = await openDb(config.databaseUrl);
  const userCount = (await db.get<any>(`SELECT COUNT(*) c FROM users`))!.c;
  if (userCount === 0) {
    if (config.seedDemo) {
      console.log('[boot] SEED_DEMO=true and database is empty: seeding demo data');
      await seedDemo(db, (m) => console.log('[seed]', m));
    } else if (config.bootstrapAdmin) {
      await createBootstrapAdmin(db, config.bootstrapAdmin);
      console.log(`[boot] created first admin "${config.bootstrapAdmin.username}"`);
    } else {
      console.warn('[warn] No users exist. Set BOOTSTRAP_ADMIN_USERNAME/BOOTSTRAP_ADMIN_PASSWORD (or SEED_DEMO=true), or run "npm run create-admin".');
    }
  }
  const app = createApp(db);
  const server = app.listen(config.port, '0.0.0.0', () => console.log(`Split Calculator API listening on :${config.port} (${db.kind})`));
  const stop = async () => { server.close(); await db.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
main().catch((e) => { console.error('[fatal]', e); process.exit(1); });
