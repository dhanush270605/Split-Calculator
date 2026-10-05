import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

/**
 * Thin async database adapter.
 *  - Production: node-postgres Pool (DATABASE_URL, e.g. Neon).
 *  - Dev/tests: PGlite (real Postgres compiled to WASM, in-process; optional data dir).
 * Keeps the `?` placeholder style; transactions propagate through AsyncLocalStorage so any helper
 * called inside `db.tx()` automatically uses the same connection.
 */
interface Executor { query(sql: string, params?: any[]): Promise<{ rows: any[]; changes: number }> }
interface Driver extends Executor {
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

const NOW_PG = `to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Translate the few SQLite-isms left in our SQL and convert ? -> $n (outside string literals). */
export function toPg(sql: string): string {
  let s = sql
    .replace(/strftime\('%Y-%m-%dT%H:%M:%fZ','now','(-?\d+) (minute|minutes|day|days|hour|hours)'\)/g,
      (_m, n, u) => `to_char((now() AT TIME ZONE 'utc') + interval '${n} ${u}','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`)
    .replace(/strftime\('%Y-%m-%dT%H:%M:%fZ','now'\)/g, NOW_PG)
    .replace(/\bLIKE\b/g, 'ILIKE')
    .replace(/\?\s+IS\s+NULL/g, '?::text IS NULL')
    .replace(/\(\?=1/g, '(?::int=1');
  let orIgnore = false;
  if (/^\s*INSERT OR IGNORE/i.test(s)) { s = s.replace(/INSERT OR IGNORE/i, 'INSERT'); orIgnore = true; }
  let out = '', n = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'") inStr = !inStr;
    out += ch === '?' && !inStr ? `$${++n}` : ch;
  }
  return orIgnore ? out + ' ON CONFLICT DO NOTHING' : out;
}

function pgDriver(url: string): Driver {
  pg.types.setTypeParser(20, (v) => parseInt(v, 10)); // int8 (COUNT/BIGINT) -> number
  pg.types.setTypeParser(1700, (v) => Number(v)); // numeric (SUM of bigint) -> number
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({ connectionString: url, max: 8, ssl: local ? undefined : { rejectUnauthorized: false }, idleTimeoutMillis: 10000, connectionTimeoutMillis: 20000, keepAlive: true });
  pool.on('error', (e) => console.error('[pg pool]', e.message));
  const wrap = (c: { query: (q: string, p?: any[]) => Promise<pg.QueryResult> }): Executor => ({
    async query(sql, params) { const r = await c.query(sql, params); return { rows: r.rows, changes: r.rowCount ?? 0 }; },
  });
  return {
    ...wrap(pool),
    async transaction(fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await fn(wrap(c));
        await c.query('COMMIT');
        return r;
      } catch (e) {
        try { await c.query('ROLLBACK'); } catch { /* connection may be gone */ }
        throw e;
      } finally { c.release(); }
    },
    async exec(sql) { await pool.query(sql); },
    async close() { await pool.end(); },
  };
}

async function pgliteDriver(dataDir?: string): Promise<Driver> {
  const { PGlite, types: pgliteTypes } = await import('@electric-sql/pglite'); // dev/test only; not loaded in production
  const lite = new PGlite(dataDir, { parsers: { [pgliteTypes.INT8]: (v: string) => parseInt(v, 10), [pgliteTypes.NUMERIC]: (v: string) => Number(v) } });
  const wrap = (c: { query: (q: string, p?: any[]) => Promise<any> }): Executor => ({
    async query(sql, params) {
      const r = await c.query(sql, params);
      // PGlite ignores custom numeric parsers: convert numeric (e.g. SUM(bigint)) columns to numbers here.
      const numCols = ((r.fields ?? []) as { name: string; dataTypeID: number }[]).filter((f) => f.dataTypeID === 1700).map((f) => f.name);
      if (numCols.length) for (const row of r.rows) for (const n of numCols) if (row[n] != null) row[n] = Number(row[n]);
      return { rows: r.rows, changes: r.affectedRows ?? 0 };
    },
  });
  return {
    ...wrap(lite),
    transaction: (fn) => lite.transaction((tx) => fn(wrap(tx))),
    async exec(sql) { await lite.exec(sql); },
    async close() { await lite.close(); },
  };
}

export class DB {
  private als = new AsyncLocalStorage<Executor>();
  constructor(private driver: Driver, public readonly kind: 'pg' | 'pglite') {}

  private async run_(sql: string, params: any[]) {
    const inTx = this.als.getStore();
    const text = toPg(sql);
    try {
      return await (inTx ?? this.driver).query(text, params);
    } catch (e: any) {
      // Serverless Postgres (Neon) drops idle connections: retry a read-only query once outside a transaction.
      if (!inTx && /^\s*(SELECT|WITH)\b/i.test(text) && /Connection terminated|ECONNRESET|terminating connection|EPIPE|ETIMEDOUT/i.test(String(e?.message))) {
        return await this.driver.query(text, params);
      }
      throw e;
    }
  }
  /** First row or undefined. */
  async get<T = any>(sql: string, ...params: any[]): Promise<T | undefined> { return (await this.run_(sql, params)).rows[0] as T | undefined; }
  async all<T = any>(sql: string, ...params: any[]): Promise<T[]> { return (await this.run_(sql, params)).rows as T[]; }
  /** Execute; returns affected row count as `changes`. */
  async run(sql: string, ...params: any[]): Promise<{ changes: number }> { const r = await this.run_(sql, params); return { changes: r.changes }; }
  /** INSERT ... RETURNING id -> new id. */
  async insert(sql: string, ...params: any[]): Promise<number> { return (await this.run_(sql + ' RETURNING id', params)).rows[0].id as number; }
  async exec(sql: string) { await this.driver.exec(sql); }
  async close() { await this.driver.close(); }

  /** Run fn in a transaction (nested calls join the outer one). */
  async tx<T>(fn: () => Promise<T>): Promise<T> {
    if (this.als.getStore()) return fn();
    return this.driver.transaction((ex) => this.als.run(ex, fn));
  }
  /** Run fn so that a failure does not poison the surrounding transaction (SAVEPOINT). Returns false on failure. */
  async attempt(fn: () => Promise<void>): Promise<{ ok: boolean; error?: unknown }> {
    const inTx = !!this.als.getStore();
    try {
      if (inTx) await this.run_('SAVEPOINT attempt_sp', []);
      await fn();
      if (inTx) await this.run_('RELEASE SAVEPOINT attempt_sp', []);
      return { ok: true };
    } catch (error) {
      if (inTx) { try { await this.run_('ROLLBACK TO SAVEPOINT attempt_sp', []); } catch { /* tx already dead */ } }
      return { ok: false, error };
    }
  }
  /** Serialise concurrent money mutations of the same event (released at end of transaction). */
  async lockEvent(eventId: number) { if (this.als.getStore()) await this.run_('SELECT pg_advisory_xact_lock(?)', [eventId]); }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT, phone TEXT, college TEXT, department TEXT, year TEXT,
  emergency_contact TEXT, notes TEXT, avatar_attachment_id INTEGER,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN','USER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW_PG}),
  updated_at TEXT NOT NULL DEFAULT (${NOW_PG})
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (lower(username));

CREATE TABLE IF NOT EXISTS events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('TRIP','HACKATHON','HACKATHON_TRIP')),
  description TEXT,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK (status IN ('DRAFT','UPCOMING','ACTIVE','COMPLETED','CANCELLED','ARCHIVED')),
  destination TEXT, start_location TEXT, organizer TEXT, college TEXT, notes TEXT,
  cover_attachment_id INTEGER,
  visibility TEXT NOT NULL DEFAULT 'PARTICIPANTS' CHECK (visibility IN ('PARTICIPANTS','ADMIN_ONLY')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (${NOW_PG}),
  updated_at TEXT NOT NULL DEFAULT (${NOW_PG}),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS event_participants (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LEFT','REMOVED')),
  added_by INTEGER REFERENCES users(id),
  added_at TEXT NOT NULL DEFAULT (${NOW_PG}),
  UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ep_user ON event_participants(user_id, status);

CREATE TABLE IF NOT EXISTS hackathon_details (
  event_id INTEGER PRIMARY KEY REFERENCES events(id),
  hackathon_name TEXT, host_org TEXT, host_college TEXT, venue TEXT, city TEXT, state TEXT,
  starts_at TEXT, ends_at TEXT,
  registration_status TEXT, registration_deadline TEXT, participation_type TEXT,
  mode TEXT CHECK (mode IN ('ONLINE','OFFLINE','HYBRID') OR mode IS NULL),
  college_approved INTEGER, approval_status TEXT, independent INTEGER,
  team_name TEXT, team_members TEXT, registration_details TEXT, required_documents TEXT,
  accommodation TEXT, food TEXT, transport TEXT, event_url TEXT, notes TEXT
);

CREATE TABLE IF NOT EXISTS trip_details (
  event_id INTEGER PRIMARY KEY REFERENCES events(id),
  intermediate_locations TEXT, return_destination TEXT, accommodation TEXT, food TEXT, tickets TEXT, notes TEXT
);

CREATE TABLE IF NOT EXISTS itinerary_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  day INTEGER NOT NULL, time TEXT, title TEXT NOT NULL, description TEXT, location TEXT,
  kind TEXT DEFAULT 'OTHER' CHECK (kind IN ('TRAVEL','HACKATHON','TOURISM','STAY','OTHER'))
);
CREATE INDEX IF NOT EXISTS idx_itin_event ON itinerary_items(event_id, day);

CREATE TABLE IF NOT EXISTS event_budgets (
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL, amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  PRIMARY KEY (event_id, category)
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  title TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  done INTEGER NOT NULL DEFAULT 0,
  done_by INTEGER REFERENCES users(id), done_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_check_event ON checklist_items(event_id);

CREATE TABLE IF NOT EXISTS travel_segments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  from_location TEXT NOT NULL, to_location TEXT NOT NULL,
  departure_at TEXT, arrival_at TEXT,
  transport_type TEXT NOT NULL CHECK (transport_type IN ('BUS','TRAIN','FLIGHT','TAXI','CAB','AUTO','RICKSHAW','CAR','BIKE','RENTAL','METRO','OTHER')),
  vehicle_details TEXT,
  booked_by INTEGER REFERENCES users(id), payer_id INTEGER REFERENCES users(id),
  ticket_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (ticket_amount_paise >= 0),
  booking_status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (booking_status IN ('PLANNED','BOOKED','CONFIRMED','CANCELLED','COMPLETED')),
  confirmation_number TEXT, notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (${NOW_PG}),
  updated_at TEXT NOT NULL DEFAULT (${NOW_PG}),
  CHECK (arrival_at IS NULL OR departure_at IS NULL OR arrival_at >= departure_at)
);
CREATE INDEX IF NOT EXISTS idx_travel_event ON travel_segments(event_id, departure_at);
CREATE TABLE IF NOT EXISTS travel_passengers (
  segment_id INTEGER NOT NULL REFERENCES travel_segments(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (segment_id, user_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  creator_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, description TEXT,
  category TEXT NOT NULL, subcategory TEXT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  payer_type TEXT NOT NULL CHECK (payer_type IN ('INDIVIDUAL','GROUP_MEMBER','COLLEGE','ORGANIZATION','OTHER')),
  payer_user_id INTEGER REFERENCES users(id),
  payer_name TEXT,
  payer_confirmed INTEGER NOT NULL DEFAULT 1,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI','CASH','CARD','BANK_TRANSFER','OTHER')),
  split_method TEXT NOT NULL CHECK (split_method IN ('EQUAL','CUSTOM','PERCENTAGE','SHARES','EXACT')),
  visibility TEXT NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC','PRIVATE')),
  private_reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL','APPROVED','DECLINED','DISPUTED','CANCELLED','SETTLED')),
  spent_at TEXT NOT NULL, location TEXT,
  from_location TEXT, to_location TEXT, transport_mode TEXT, travel_segment_id INTEGER REFERENCES travel_segments(id),
  notes TEXT,
  idempotency_key TEXT UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (${NOW_PG}),
  updated_at TEXT NOT NULL DEFAULT (${NOW_PG})
);
CREATE INDEX IF NOT EXISTS idx_exp_event ON expenses(event_id, spent_at);
CREATE INDEX IF NOT EXISTS idx_exp_creator ON expenses(creator_id);
CREATE INDEX IF NOT EXISTS idx_exp_payer ON expenses(payer_user_id);
CREATE INDEX IF NOT EXISTS idx_exp_status ON expenses(status);

CREATE TABLE IF NOT EXISTS expense_allocations (
  expense_id INTEGER NOT NULL REFERENCES expenses(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  share_paise BIGINT NOT NULL CHECK (share_paise >= 0),
  split_value BIGINT,
  approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING','APPROVED','DECLINED')),
  responded_at TEXT, response_note TEXT,
  PRIMARY KEY (expense_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_alloc_user ON expense_allocations(user_id, approval_status);

CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses(id),
  raised_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL, message TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED','CORRECTED')),
  resolution_note TEXT, resolved_by INTEGER REFERENCES users(id), resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW_PG})
);
CREATE INDEX IF NOT EXISTS idx_disp_expense ON disputes(expense_id, status);

CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  method TEXT CHECK (method IN ('UPI','CASH','CARD','BANK_TRANSFER','OTHER') OR method IS NULL),
  status TEXT NOT NULL DEFAULT 'PAID' CHECK (status IN ('PENDING','PAYMENT_INITIATED','PAID','CONFIRMED','DISPUTED','CANCELLED')),
  note TEXT, admin_note TEXT,
  idempotency_key TEXT UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (${NOW_PG}),
  paid_at TEXT, confirmed_at TEXT, confirmed_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (${NOW_PG}),
  CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_set_event ON settlements(event_id, status);
CREATE INDEX IF NOT EXISTS idx_set_users ON settlements(from_user_id, to_user_id);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('EXPENSE','SETTLEMENT','TRAVEL','DISPUTE','PROFILE','EVENT','PROBLEM')),
  entity_id INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL REFERENCES users(id),
  original_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  kind TEXT, created_at TEXT NOT NULL DEFAULT (${NOW_PG})
);
CREATE INDEX IF NOT EXISTS idx_att_entity ON attachments(entity_type, entity_id);
-- Evidence bytes live in the database: free hosts have ephemeral disks.
CREATE TABLE IF NOT EXISTS attachment_data (
  attachment_id INTEGER PRIMARY KEY REFERENCES attachments(id) ON DELETE CASCADE,
  data BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'INFO' CHECK (level IN ('INFO','SUCCESS','WARNING','ERROR','ACTION_REQUIRED')),
  title TEXT NOT NULL, body TEXT,
  entity_type TEXT, entity_id INTEGER, event_id INTEGER,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW_PG})
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id INTEGER, actor_name TEXT,
  action TEXT NOT NULL, entity_type TEXT, entity_id INTEGER, event_id INTEGER,
  metadata TEXT, previous_state TEXT, new_state TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW_PG})
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at);
CREATE OR REPLACE FUNCTION audit_immutable() RETURNS trigger AS $fn$
BEGIN RAISE EXCEPTION 'audit_logs is immutable'; END;
$fn$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_no_change ON audit_logs;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_immutable();

CREATE TABLE IF NOT EXISTS system_errors (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'ERROR' CHECK (level IN ('ERROR','WARNING')),
  source TEXT NOT NULL, message TEXT NOT NULL, stack TEXT, context TEXT,
  user_id INTEGER, resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (${NOW_PG})
);
CREATE INDEX IF NOT EXISTS idx_err_created ON system_errors(created_at);

CREATE TABLE IF NOT EXISTS problem_reports (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'OTHER', device_info TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','INVESTIGATING','RESOLVED')),
  admin_note TEXT, resolved_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (${NOW_PG}),
  updated_at TEXT NOT NULL DEFAULT (${NOW_PG})
);
`;

/**
 * Open the database. `target`: a postgres:// URL (production), ':memory:' (tests) or a directory path (local PGlite persistence).
 */
export async function openDb(target: string): Promise<DB> {
  const db = /^postgres(ql)?:\/\//i.test(target)
    ? new DB(pgDriver(target), 'pg')
    : new DB(await pgliteDriver(target === ':memory:' ? undefined : target), 'pglite');
  await db.exec(SCHEMA);
  return db;
}

export const nowIso = () => new Date().toISOString();
