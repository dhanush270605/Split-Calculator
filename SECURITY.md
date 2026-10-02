# Security

## Controls implemented (all verified by tests in `server/test/security.test.ts`)
- **Admin-created accounts only.** No registration endpoint. A non-admin `POST /users` is 403, and tampering with `role` through profile is rejected.
- **Passwords:** bcrypt hashes only. Temporary passwords are cryptographically random, shown once, and force a change at first login. Password change, reset, role change, or deactivation bumps `token_version`, which invalidates every existing JWT immediately. Passwords never appear in audit or error logs.
- **Authorization lives on the server.** `role` is read from the DB on **every** request (the JWT carries only id + version). Admin routes use `requireAdmin`. No username-based checks, and the frontend only hides buttons.
- **Visibility enforced in SQL** (`access.ts: expenseVisibilitySql`). Private expenses (and their reason, evidence, activity entries, and timeline items) are invisible to anyone who is not creator / payer / participant / admin. Non-members get 404 for events and private expenses.
- **Input validation** with zod on every body; parameterised SQL only (injection test included); body size cap 256 KB; helmet headers; CORS configurable.
- **Uploads:** magic-byte type detection (not the client mime or extension), 5 MB cap, random server-side names, path-traversal-safe, `nosniff`, served only through an authorized endpoint, and failures logged.
- **Brute force:** 8 failed logins / 15 min per ip+username → 429; 5 failures raise an admin notification.
- **Money integrity:** integer paise, exact-sum split validation, idempotency keys, optimistic locking, immutable audit log.
- **Secrets:** `JWT_SECRET` is required in production; `.env*` is git-ignored; only `.env.example` is committed.

## Known trade-offs / limitations
- **Aggregate balances are shared with event participants** (needed for "who owes whom"). A private expense that creates debt changes the involved people's net balance and the event total, but its title, reason, and evidence stay hidden.
- Login throttle is in-memory (resets on restart; per-instance). The web build stores the token in AsyncStorage (localStorage). Native uses SecureStore.
- Uploaded files are not virus-scanned. Tokens are 12 h with no refresh flow. HTTPS must be provided by the host/reverse proxy in production.
- Demo credentials in `DEMO_ACCOUNTS.md` are for local development only. Never seed a production database.
