# Split Calculator

Expense splitting and management for **trips, hackathons, and hackathon + trip** events. It answers who paid, who benefited, who approved, and who owes whom. The server is the single source of truth for money.

- **Mobile app:** Expo (React Native + TypeScript), also runs on web
- **Backend:** Node.js + Express + PostgreSQL (Neon in production, embedded PGlite for local dev/tests), JWT auth, role-based authorization
- **Cost:** ₹0. No paid services anywhere (see [PROJECT_PLAN.md](PROJECT_PLAN.md) §5 for why this stack rather than Firebase/Supabase).

## Features
- Admin-only account creation (no public sign-up), roles `ADMIN` / `USER`, active/inactive/archived accounts
- Events: Trip, Hackathon, Hackathon + Trip, with hackathon/trip details, itinerary, budget vs actual, checklist, travel segments, lifecycle (draft → upcoming → active → completed / cancelled / archived)
- Expenses: 9 categories, 5 payer types (individual, group member, college, organization, other sponsor), personal expenses, public/private visibility with a reason
- Split methods: equal, custom, percentage, shares, exact. Integer paise and deterministic rounding, and the split always sums exactly
- Participant **approval workflow** (approve / decline / re-approve after edits), disputes, optimistic concurrency, admin overrides (always audited)
- Settlement engine: net balances, minimal "who owes whom", payment flow (paid → confirmed / disputed / cancelled), partial payments, admin override
- Notifications (INFO / SUCCESS / WARNING / ERROR / ACTION_REQUIRED), polling every 15 s
- Admin: dashboard, users, audit log, system errors/health, maintenance (problem reports), disputes, event reports + CSV
- Offline resilience: failed-network expense creation is queued and retried with an idempotency key (no duplicates)

## Quick start (Windows / macOS / Linux)
Prerequisites: Node.js 20+ (tested on 22), npm.

```bash
npm run install:all      # installs server + app dependencies
npm run seed             # (re)creates the local embedded database with 1 admin + 10 users + 3 events (see DEMO_ACCOUNTS.md)
npm run dev:api          # API on http://localhost:4000
```
In a second terminal:
```bash
npm run dev:web          # Expo web on http://localhost:8081  (or: npm run dev:app, then scan the QR with Expo Go)
```
Sign in as `admin` / `Admin@1234` or any demo user, e.g. `dhanush` / `Demo@1234`. Details in [DEMO_ACCOUNTS.md](DEMO_ACCOUNTS.md).

On a physical phone, set `EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:4000/api` in `app/.env` (see `app/.env.example`) and allow port 4000 through the firewall.

## Commands
| Task | Command |
|---|---|
| Typecheck + "lint" (strict TS) | `npm run typecheck` / `npm run lint` |
| Tests (74) | `npm test` |
| Build server + web | `npm run build` |
| Everything | `npm run verify` |
| First real admin | `ADMIN_USERNAME=me ADMIN_PASSWORD='Str0ng!Pass' npm run create-admin` |

## Environment
See `server/.env.example` and `app/.env.example`. In production `JWT_SECRET` is mandatory. Real `.env` files are git-ignored.

## Building an Android APK
There is no Android SDK or Java on the dev machine used here, so **no APK was built locally**. Free path via EAS Build (free tier has monthly limits):
```bash
cd app
npm i -g eas-cli && eas login
# set EXPO_PUBLIC_API_URL in eas.json (preview profile) to your deployed API
eas build -p android --profile preview      # produces an installable .apk
```
See [DEPLOYMENT.md](DEPLOYMENT.md).

## Documentation
[PROJECT_PLAN](PROJECT_PLAN.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DATABASE_SCHEMA](DATABASE_SCHEMA.md) · [API_DOCUMENTATION](API_DOCUMENTATION.md) · [SECURITY](SECURITY.md) · [TESTING](TESTING.md) · [DEPLOYMENT](DEPLOYMENT.md) · [TROUBLESHOOTING](TROUBLESHOOTING.md) · [DEMO_ACCOUNTS](DEMO_ACCOUNTS.md) · [CHANGELOG](CHANGELOG.md) · [IMPLEMENTATION_REPORT](IMPLEMENTATION_REPORT.md)

## Free-tier / limits
PostgreSQL on Neon's free tier (0.5 GB). Evidence files are stored in the database (bytea). The free API host sleeps when idle. Notifications are in-app (polled), with no push. See IMPLEMENTATION_REPORT.md for the full known-limitations list.

## Roadmap
Push notifications (Expo push), receipt OCR, UPI deep links, CSV/PDF export for users, multi-currency, group chat, Postgres adapter.

## Production deployment (free)
See [DEPLOYMENT.md](DEPLOYMENT.md): Neon (Postgres) + Render (API, auto-deploy from GitHub) + EAS (Android APK, OTA updates).
