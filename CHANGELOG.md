# Changelog

## 1.0.0 — 2026-10-02
Initial complete implementation.
- Backend: Express + SQLite, JWT + bcrypt, role-based authorization, SQL-enforced expense visibility, audit log (immutable), notifications, system error log, problem reports, uploads with magic-byte validation.
- Engine: integer-paise split methods, ledger, debt simplification.
- Workflows: approvals, disputes, settlements, admin overrides, idempotency, optimistic concurrency.
- App: Expo Router app (user + admin), offline queue for expense creation, live split preview.
- Seed: 1 admin, 10 users, 3 events (Trip / Hackathon / Hackathon + Trip), 19 expenses in every state.
- 74 automated tests (unit, integration, security).

## 1.2.0 - 2026-10-05
- Backend migrated from SQLite to PostgreSQL (Neon in production, PGlite for dev/tests); attachments stored in DB; advisory locks + row locks for concurrent money mutations.
- App: no hardcoded LAN URL; production API URL via EAS env / app.json; cold-start retry with 'waking up' state; Android-safe login; EAS Update configured.
- Render blueprint, first-admin bootstrap via env, DB-aware health check.
