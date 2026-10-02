# Changelog

## 1.0.0 — 2026-10-02
Initial complete implementation.
- Backend: Express + SQLite, JWT + bcrypt, role-based authorization, SQL-enforced expense visibility, audit log (immutable), notifications, system error log, problem reports, uploads with magic-byte validation.
- Engine: integer-paise split methods, ledger, debt simplification.
- Workflows: approvals, disputes, settlements, admin overrides, idempotency, optimistic concurrency.
- App: Expo Router app (user + admin), offline queue for expense creation, live split preview.
- Seed: 1 admin, 10 users, 3 events (Trip / Hackathon / Hackathon + Trip), 19 expenses in every state.
- 74 automated tests (unit, integration, security).
