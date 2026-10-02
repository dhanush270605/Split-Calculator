/** Create the first (real) admin. Usage: ADMIN_USERNAME=me ADMIN_PASSWORD='Strong#Pass1' ADMIN_NAME='My Name' npm run create-admin */
import { config } from './config.js';
import { openDb } from './db.js';
import { createBootstrapAdmin } from './seed.js';
import { validatePasswordStrength } from './auth.js';

const username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD, name = process.env.ADMIN_NAME ?? username;
if (!username || !password || !name) {
  console.error('Set ADMIN_USERNAME, ADMIN_PASSWORD (and optionally ADMIN_NAME).');
  process.exit(1);
}
validatePasswordStrength(password);
const db = openDb(config.dbPath);
if (db.prepare(`SELECT 1 FROM users WHERE username=?`).get(username)) { console.error('That username already exists.'); process.exit(1); }
createBootstrapAdmin(db, { username, password, name });
console.log(`Admin "${username}" created.`);
