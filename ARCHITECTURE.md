# Architecture

```
Expo app (React Native + TS, Expo Router)  ──HTTPS/JSON + Bearer JWT──▶  Express API  ──▶  PostgreSQL (Neon) - evidence stored in the DB
 src/lib/api.ts  (client, idempotency keys)                               src/routes/*   thin HTTP + zod validation
 src/lib/queue.ts (offline queue)                                         src/services/* business rules, transactions
 src/lib/auth.tsx (session, 15s polling)                                  src/engine/*   pure money functions
```

## Server layout (`server/src`)
| Path | Responsibility |
|---|---|
| `engine/money.ts` | paise ⇄ rupees, Indian digit grouping |
| `engine/split.ts` | `computeSplit` (EQUAL, CUSTOM, PERCENTAGE, SHARES, EXACT), largest-remainder rounding |
| `engine/balances.ts` | `computeLedger` (the one authoritative balance calculation), `simplifyDebts` |
| `services/ledger.ts` | loads DB rows → engine; in-flight payment accounting |
| `services/expenses.ts` | create/update/respond/cancel/dispute rules, approval state machine |
| `access.ts` | event membership, **SQL expense-visibility predicate**, attachment access |
| `auth.ts` | bcrypt, JWT, `requireAuth` / `requireAdmin`, login throttle |
| `helpers.ts` | `audit()`, `notify()`, `logSystemError()` |
| `routes/*` | auth, users, events, travel, expenses, settlements, admin/reports, uploads, notifications, problems |
| `seed.ts` | demo data, produced through the real HTTP API |

## Key design decisions
- **Single source of truth.** Balances are computed only by `engine/balances.ts`. The app renders what the server returns and never computes balances itself. The split *preview* is also a server call.
- **Money = integer paise** everywhere (DB `INTEGER`, API `*Paise`).
- **Approval gates debt.** Only `APPROVED` allocations count. The payer is credited only for confirmed shares; anything unconfirmed stays the payer's own cost until corrected.
- **Sponsored (COLLEGE / ORGANIZATION / OTHER) and PERSONAL** expenses count toward event totals but never create member debt.
- **Everything important is one SQLite transaction**: change + audit row + notifications commit together.
- **Idempotency.** `expenses.idempotency_key` and `settlements.idempotency_key` are UNIQUE. A retry returns the original record with `duplicate: true`. Confirming a settlement twice is a no-op. Expense edits use `version` optimistic locking (409 on conflict).
- **History is never deleted.** Users are deactivated, not removed. Cancelled expenses stay. Removed participants are marked `REMOVED`. `audit_logs` has triggers that reject UPDATE and DELETE.
- **404 instead of 403** for resources the caller may not know exist (other people's events and private expenses).

## Expense status machine
`PENDING_APPROVAL` → (all approve) → `APPROVED` → (all balances zero after confirmed payments) → `SETTLED`.
Any decline → `DECLINED` (creator edits + resubmits → back to `PENDING_APPROVAL` for the affected people). An open dispute → `DISPUTED` until an admin resolves it. `CANCELLED` is terminal.

## Event state rules
Expenses: users may add or edit in `UPCOMING` / `ACTIVE`. Settlements: `ACTIVE` / `COMPLETED`. Admin bypasses state checks (still audited).

## Frontend
Expo Router file routes in `app/src/app`: `(tabs)` (Home/Dashboard, Trips/Events, Expenses, Settle, Alerts, Admin (admins only), Profile), plus `event/[id]` (overview, timeline, expenses, travel, settle, activity), `expense/new|[id]`, `admin/*`. A tiny design system lives in `src/ui` (light/dark aware). Cross-platform confirm/notice helpers replace `Alert` (which doesn't work on web).

## Notifications
Rows in `notifications`, written in the same transaction as the change. The app polls `/notifications/unread-count` every 15 s and on app foreground. Push is a documented extension point (needs device tokens and a native build).
