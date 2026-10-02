# PROJECT PLAN — Split Calculator

## 1. Product vision
Remove money arguments from group trips and hackathons. For every expense the app records who paid, who benefited, who approved, and the resulting settlement. Every rupee must be traceable and every change audited.

## 2. User roles
| Role | Capabilities |
|---|---|
| ADMIN | Full visibility (incl. private expenses), creates users/events, assigns members, resolves disputes, overrides records (always audited), sees audit/error/maintenance data. |
| USER | Sees only events they belong to; creates/edits own expenses; approves/declines own shares; settles; reports problems/disputes. |

Role lives in the database (`users.role`) and is checked by server middleware. There is no username-based or frontend-only admin check.

## 3. Functional requirements
Summarised from the product brief: admin-only user creation; Trip / Hackathon / Hackathon+Trip events with type-specific details, itinerary, travel segments, budgets, checklist; expenses with 5 split methods, payer types (individual, group member, college, organization, other sponsor), personal expenses, public/private visibility, evidence upload; participant approval workflow; disputes; settlement engine + settlement payment workflow; notifications; audit log; error/maintenance centre; reports; offline-tolerant expense creation.

## 4. Non-functional requirements
Accuracy (integer paise, deterministic), security (server-enforced), auditability, ₹0 cost, 10–100 concurrent students, poor-network tolerance (idempotent retries, offline queue), maintainability (small modules, tests).

## 5. Architecture
```
Expo React Native app (TypeScript)  --HTTPS/JSON-->  Node/Express API (TypeScript)  -->  SQLite (WAL) + local upload dir
                                                       └ Calculation engine (single source of truth)
```
Monorepo folders: `server/` (API, DB, engine, tests, seed) and `app/` (Expo client). The app never computes authoritative balances; it renders what the server returns.

**Backend decision (compared):**
| Option | Verdict |
|---|---|
| Firebase (Auth+Firestore+Storage+Emulators) | Emulator Suite needs Java (absent on this machine). Firestore rules cannot do cross-document financial validation/transactional recalculation well; Storage needs Blaze plan for new projects → card required. Rejected. |
| Supabase | Good (Postgres + RLS), but free projects pause after inactivity, needs a hosted project/credentials to even test, and financial logic would live in SQL functions. Viable later. |
| **Node + Express + SQLite (chosen)** | ₹0, zero external accounts, runs fully offline for dev, ACID transactions for money, easy to test, trivially portable to Postgres later (SQL is standard). Deployable free on Render/Fly/Railway-style hosts or a laptop on LAN. |

## 6. Frontend architecture
Expo + React Navigation (bottom tabs for user, stack for details; admin tabs for admin). `api.ts` client with token storage, idempotency keys and an offline mutation queue (AsyncStorage). Small design system (`theme.ts`, `ui.tsx`). Screens per role; polling (15 s) for notifications. Runs on Android/iOS via Expo Go and on web (used for automated verification).

## 7. Backend architecture
`routes/*` (thin HTTP + zod validation) → `services` logic inside route modules using `db.transaction` → `engine/*` (pure functions) → `audit`/`notify` helpers. Central error handler maps `AppError` to safe JSON and writes unexpected errors to `system_errors`.

## 8. Database architecture
SQLite tables: `users, events, event_participants, hackathon_details, trip_details, itinerary_items, event_budgets, checklist_items, travel_segments, travel_passengers, expenses, expense_allocations, disputes, settlements, attachments, notifications, audit_logs, system_errors, problem_reports`. Money = INTEGER paise. Foreign keys on. Indexes on all hot paths. `audit_logs` has triggers that reject UPDATE/DELETE. Full detail in `DATABASE_SCHEMA.md`.

## 9. Authentication
Admin-created accounts only; no register endpoint. `bcryptjs` hashes (cost 10). Login → signed JWT (HS256, secret from env, 12 h) containing user id + `tokenVersion`; changing/resetting a password or deactivating a user bumps `tokenVersion`, invalidating tokens. Temp passwords force change on first login. Login throttling per username+IP; failures logged.

## 10. Authorization
Middleware `requireAuth`, `requireAdmin`; per-event membership check; per-expense visibility check in SQL (list) and function (single). Attachments served only through an authorised endpoint.

## 11. Expense calculation model
Integer paise. Split methods: EQUAL, CUSTOM (exact), PERCENTAGE (basis points), SHARES, EXACT. Rounding by largest-remainder, deterministic tie-break by userId, so allocations always sum exactly to the total.
Balance rules per expense: payerType ≠ INDIVIDUAL/GROUP_MEMBER (college/org/other) → no member debt, counts as sponsored; PERSONAL → no debt; otherwise payer is credited and each **APPROVED** non-payer allocation is debited. PENDING/DECLINED allocations never count. `net = paid − owed`; settlement payments with status CONFIRMED reduce outstanding. Who-owes-whom = greedy max-creditor/max-debtor matching (≤ n−1 transfers).

## 12. Notification architecture
In-app notifications table (levels INFO/SUCCESS/WARNING/ERROR/ACTION_REQUIRED), written in the same transaction as the triggering change; app polls. Push (Expo push / FCM) is a documented extension point — it needs device tokens and a build, not required for baseline.

## 13. Admin architecture
Admin routes under `/api/admin/*` guarded by `requireAdmin`: dashboard stats, users, activity (audit), errors, maintenance (problem reports), reports, dispute resolution, overrides.

## 14. Error / maintenance architecture
Every route wrapped; validation errors → 400 with field messages; unexpected → 500 generic message + row in `system_errors`. Users file problem reports; admin triages (OPEN → INVESTIGATING → RESOLVED). Client reports uncaught failures to `/api/client-errors`.

## 15. Security architecture
See `SECURITY.md`. Helmet, CORS allow-list, body size caps, zod validation, parameterised SQL only, upload magic-byte validation, secrets from env, no secrets committed.

## 16. Testing strategy
Vitest. Unit (engine), integration (supertest against in-memory SQLite: login, events, expenses, approval, decline, settlement), security (role/visibility/arbitrary accounts/non-members/IDOR), UI smoke via web export in the built-in browser.

## 17. Demo data strategy
`npm run seed` builds 1 admin + 10 users, 3 events (Trip, Hackathon, Hackathon+Trip) with expenses in every state, settlements, notifications.

## 18. Deployment
Local first. Server: any free Node host with a persistent disk (or home server); app: Expo Go / EAS Build (free tier) APK. See `DEPLOYMENT.md`.

## 19. Roadmap
Push notifications, receipt OCR, UPI deep links, CSV/PDF export, multi-currency, group chat, live location, Postgres adapter.

## 20. Known limitations
SQLite = single-node (fine for 10–100 users). Polling instead of websockets. No Android APK built locally (no Java/Android SDK here). Evidence stored on server disk, not object storage.

## 21. Free-tier constraints
Everything is ₹0: Node, SQLite, Expo (free), EAS Build free tier (limited builds/month, queue times), GitHub free. No paid APIs used anywhere.
