import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  email TEXT, phone TEXT, college TEXT, department TEXT, year TEXT,
  emergency_contact TEXT, notes TEXT, avatar_attachment_id INTEGER,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','USER')) DEFAULT 'USER',
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')) DEFAULT 'ACTIVE',
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('TRIP','HACKATHON','HACKATHON_TRIP')),
  description TEXT,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','UPCOMING','ACTIVE','COMPLETED','CANCELLED','ARCHIVED')) DEFAULT 'UPCOMING',
  destination TEXT, start_location TEXT, organizer TEXT, college TEXT, notes TEXT,
  cover_attachment_id INTEGER,
  visibility TEXT NOT NULL CHECK (visibility IN ('PARTICIPANTS','ADMIN_ONLY')) DEFAULT 'PARTICIPANTS',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS event_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','LEFT','REMOVED')) DEFAULT 'ACTIVE',
  added_by INTEGER REFERENCES users(id),
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  day INTEGER NOT NULL, time TEXT, title TEXT NOT NULL, description TEXT, location TEXT,
  kind TEXT CHECK (kind IN ('TRAVEL','HACKATHON','TOURISM','STAY','OTHER')) DEFAULT 'OTHER'
);
CREATE INDEX IF NOT EXISTS idx_itin_event ON itinerary_items(event_id, day);

CREATE TABLE IF NOT EXISTS event_budgets (
  event_id INTEGER NOT NULL REFERENCES events(id),
  category TEXT NOT NULL, amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  PRIMARY KEY (event_id, category)
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  title TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),           -- NULL = applies to the whole group
  done INTEGER NOT NULL DEFAULT 0,
  done_by INTEGER REFERENCES users(id), done_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_check_event ON checklist_items(event_id);

CREATE TABLE IF NOT EXISTS travel_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  from_location TEXT NOT NULL, to_location TEXT NOT NULL,
  departure_at TEXT, arrival_at TEXT,
  transport_type TEXT NOT NULL CHECK (transport_type IN ('BUS','TRAIN','FLIGHT','TAXI','CAB','AUTO','RICKSHAW','CAR','BIKE','RENTAL','METRO','OTHER')),
  vehicle_details TEXT,
  booked_by INTEGER REFERENCES users(id), payer_id INTEGER REFERENCES users(id),
  ticket_amount_paise INTEGER NOT NULL DEFAULT 0 CHECK (ticket_amount_paise >= 0),
  booking_status TEXT NOT NULL CHECK (booking_status IN ('PLANNED','BOOKED','CONFIRMED','CANCELLED','COMPLETED')) DEFAULT 'PLANNED',
  confirmation_number TEXT, notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (arrival_at IS NULL OR departure_at IS NULL OR arrival_at >= departure_at)
);
CREATE INDEX IF NOT EXISTS idx_travel_event ON travel_segments(event_id, departure_at);
CREATE TABLE IF NOT EXISTS travel_passengers (
  segment_id INTEGER NOT NULL REFERENCES travel_segments(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  PRIMARY KEY (segment_id, user_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  creator_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, description TEXT,
  category TEXT NOT NULL, subcategory TEXT,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  payer_type TEXT NOT NULL CHECK (payer_type IN ('INDIVIDUAL','GROUP_MEMBER','COLLEGE','ORGANIZATION','OTHER')),
  payer_user_id INTEGER REFERENCES users(id),
  payer_name TEXT,                                   -- sponsor name for COLLEGE/ORGANIZATION/OTHER
  payer_confirmed INTEGER NOT NULL DEFAULT 1,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('UPI','CASH','CARD','BANK_TRANSFER','OTHER')),
  split_method TEXT NOT NULL CHECK (split_method IN ('EQUAL','CUSTOM','PERCENTAGE','SHARES','EXACT')),
  visibility TEXT NOT NULL CHECK (visibility IN ('PUBLIC','PRIVATE')) DEFAULT 'PUBLIC',
  private_reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING_APPROVAL','APPROVED','DECLINED','DISPUTED','CANCELLED','SETTLED')) DEFAULT 'PENDING_APPROVAL',
  spent_at TEXT NOT NULL, location TEXT,
  from_location TEXT, to_location TEXT, transport_mode TEXT, travel_segment_id INTEGER REFERENCES travel_segments(id),
  notes TEXT,
  idempotency_key TEXT UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_exp_event ON expenses(event_id, spent_at);
CREATE INDEX IF NOT EXISTS idx_exp_creator ON expenses(creator_id);
CREATE INDEX IF NOT EXISTS idx_exp_payer ON expenses(payer_user_id);
CREATE INDEX IF NOT EXISTS idx_exp_status ON expenses(status);

CREATE TABLE IF NOT EXISTS expense_allocations (
  expense_id INTEGER NOT NULL REFERENCES expenses(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  share_paise INTEGER NOT NULL CHECK (share_paise >= 0),
  split_value INTEGER,
  approval_status TEXT NOT NULL CHECK (approval_status IN ('PENDING','APPROVED','DECLINED')) DEFAULT 'PENDING',
  responded_at TEXT, response_note TEXT,
  PRIMARY KEY (expense_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_alloc_user ON expense_allocations(user_id, approval_status);

CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL REFERENCES expenses(id),
  raised_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL, message TEXT,
  status TEXT NOT NULL CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED','CORRECTED')) DEFAULT 'OPEN',
  resolution_note TEXT, resolved_by INTEGER REFERENCES users(id), resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_disp_expense ON disputes(expense_id, status);

CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id),
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  method TEXT CHECK (method IN ('UPI','CASH','CARD','BANK_TRANSFER','OTHER') OR method IS NULL),
  status TEXT NOT NULL CHECK (status IN ('PENDING','PAYMENT_INITIATED','PAID','CONFIRMED','DISPUTED','CANCELLED')) DEFAULT 'PAID',
  note TEXT, admin_note TEXT,
  idempotency_key TEXT UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_at TEXT, confirmed_at TEXT, confirmed_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_set_event ON settlements(event_id, status);
CREATE INDEX IF NOT EXISTS idx_set_users ON settlements(from_user_id, to_user_id);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('EXPENSE','SETTLEMENT','TRAVEL','DISPUTE','PROFILE','EVENT','PROBLEM')),
  entity_id INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL REFERENCES users(id),
  original_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
  kind TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_att_entity ON attachments(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('INFO','SUCCESS','WARNING','ERROR','ACTION_REQUIRED')) DEFAULT 'INFO',
  title TEXT NOT NULL, body TEXT,
  entity_type TEXT, entity_id INTEGER, event_id INTEGER,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER, actor_name TEXT,
  action TEXT NOT NULL, entity_type TEXT, entity_id INTEGER, event_id INTEGER,
  metadata TEXT, previous_state TEXT, new_state TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, created_at);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs is immutable'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit_logs is immutable'); END;

CREATE TABLE IF NOT EXISTS system_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL CHECK (level IN ('ERROR','WARNING')) DEFAULT 'ERROR',
  source TEXT NOT NULL, message TEXT NOT NULL, stack TEXT, context TEXT,
  user_id INTEGER, resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_err_created ON system_errors(created_at);

CREATE TABLE IF NOT EXISTS problem_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'OTHER', device_info TEXT,
  status TEXT NOT NULL CHECK (status IN ('OPEN','INVESTIGATING','RESOLVED')) DEFAULT 'OPEN',
  admin_note TEXT, resolved_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  return db;
}

export const nowIso = () => new Date().toISOString();
