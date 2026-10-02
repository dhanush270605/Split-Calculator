# Implementation report

## 1. What was built
A complete expense-splitting system for trips and hackathons: Node/Express/SQLite API with an authoritative calculation engine, an Expo (React Native + TypeScript) app for users and admins (also runs on web), seed data, tests, and docs.

## 2. Technology stack
Node 22, Express 5, better-sqlite3, zod, bcryptjs, jsonwebtoken, multer, helmet, cors · Expo SDK 57, React Native 0.86, Expo Router, TypeScript 6 · Vitest + supertest.

## 3-4. Architecture & database
See [ARCHITECTURE.md](ARCHITECTURE.md) and [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md). Backend choice: Firebase was rejected because the Emulator Suite needs Java (absent here) and Firestore rules are weak for transactional money logic. Supabase needs a hosted project and credentials. Node + SQLite gives ₹0, zero external accounts, and ACID transactions.

## 5-6. Authentication / authorization
bcrypt + JWT (token_version revocation), forced password change for temp passwords, login throttle. Role is re-read from the DB on every request, and expense visibility is a SQL predicate. See [SECURITY.md](SECURITY.md).

## 7. Expense calculation
`computeSplit`: integer paise, largest-remainder rounding (ties → lower userId), strict validation (exact sum, percentages = 100%, shares ≥ 1). `computeLedger`: payer credited only for APPROVED shares of others; sponsored (college/org/other) and PERSONAL create no debt; only CONFIRMED settlements reduce outstanding; `net = paid − owed (+ settledOut − settledIn)`.

## 8. Settlement algorithm
`simplifyDebts`: repeatedly match the largest debtor with the largest creditor → at most n−1 transfers, total money conserved (unit-tested). Payments: PAID → CONFIRMED (receiver) / DISPUTED / CANCELLED, partial payments supported, over-payment blocked (amounts in flight are reserved), duplicate confirm is a no-op, admin override requires a reason and is audited. When all balances reach zero the approved expenses become SETTLED.

## 9. Notifications
In-app, levels INFO/SUCCESS/WARNING/ERROR/ACTION_REQUIRED, created in the same transaction as the change, polled every 15 s and on foreground. Failures to notify are logged to `system_errors` without breaking the operation.

## 10-11. Admin / user functionality
Admin: dashboard, user management (create / edit / activate / deactivate / archive / reset / activity), event create + edit + extend + status + participants, travel, disputes, audit, errors/health, problem reports, announcements, event reports (+CSV), settlement override. User: dashboard, trips, expense creation (all split methods, evidence), approvals, history with filters, settlements, notifications, profile, problem reports, spending report.

## 12-13. Demo
See [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md). `npm run seed` → 1 admin + 10 users, 3 events, 19 expenses (all states), 5 settlements, 265 notifications, 108 audit rows.

## 14. Test results (executed)
- `npm test`: **74 / 74 passed** (22 unit, 32 integration, 20 security).
- `npm run typecheck`: server and app clean. `npm run build`: server `tsc` build OK; Expo web export OK.
- Compiled server (`node dist/index.js`, production mode) booted; `/api/health` = 200; protected route = 401.
- **UI end-to-end (web build, built-in browser):** login as user → dashboard (private expenses correctly absent); event settlement view (totals reconcile: ₹40,190 total, ₹5,000 sponsored); expense form with a live split preview (unbalanced split rejected, balanced ₹100×3 accepted) → expense created; second user approved; admin dashboard; audit log showed the UI actions; system health healthy.
- Bugs found by testing and fixed: must-change-password gate blocked change-password itself; mojibake from a file move; creator saw a "Decline" button for their own share; split error message in paise.

## 15. Build result
Server and web: built. **Android APK: not built**, because this machine has no Java / Android SDK. Exact EAS commands are in README / DEPLOYMENT.

## 16. GitHub status
See the final handoff. Local repo is initialised on top of the remote's single commit (history preserved).

## 17. Files
`server/` (src, test), `app/` (src/app, src/ui, src/lib, config), root docs (12 `.md`), `.gitignore`, env examples, `eas.json`, `.claude/launch.json`.

## 18. Known limitations (honest list)
- Verified in a **browser (web build) only**. Not run on Android/iOS devices or emulators. Native-only paths (SecureStore, image picker on device, FileReader data URLs) are untested.
- No push notifications (polling only). Offline queue covers expense creation only, and evidence photos can't be queued (they can be added afterwards).
- UI gaps (API supports them): profile photo upload, travel-ticket and settlement-evidence upload, event cover image, creating checklist items after event creation, per-user event membership edits from the user screen, a user-facing CSV export, settlement admin-override screen (use API).
- Dates are typed as text (`YYYY-MM-DD`), with no native date picker.
- Aggregate balances are visible to all event participants (documented trade-off).
- Login throttle is in-memory; single-node SQLite; no refresh tokens; no automated UI tests; no load test; "lint" is strict `tsc` (no ESLint).
- Event-state rules are my interpretation: users can add expenses in UPCOMING/ACTIVE, settle in ACTIVE/COMPLETED; admins bypass.

## 19. Free-tier limitations
Everything runs at ₹0. EAS Build free tier limits monthly builds and has queue times; free API hosts may sleep or lack persistent disks. Pick one with a disk, or self-host.

## 20. Future improvements
Push notifications, receipt OCR, UPI deep links, PDF/CSV for users, multi-currency, chat, Postgres adapter, ESLint, Detox/Playwright UI tests, native date pickers.

## 21. Exact commands
```bash
npm run install:all && npm run seed
npm run dev:api        # terminal 1
npm run dev:web        # terminal 2  → http://localhost:8081
npm run verify         # typecheck + tests + builds
```
