# Testing

```bash
npm test            # 74 tests, ~6 s (Vitest + supertest, in-memory SQLite, no network)
npm run typecheck   # strict TypeScript for server and app
npm run verify      # typecheck + tests + builds
```

| Suite | File | Covers |
|---|---|---|
| Unit (22) | `test/engine.test.ts` | equal / custom / percentage / shares / exact splits, rounding conserves every paisa, invalid input, ledger (spec examples), college-sponsored = zero debt, personal, approval/decline/pending, unconfirmed payer, settlement effects, debt simplification (≤ n−1 transfers, money conserved) |
| Integration (32) | `test/integration.test.ts` | login, temp-password flow, event types, extension audit, participants, travel validation, create → approve → decline → edit → resubmit, re-approval after edit, version conflicts, idempotent creation, duplicate detection, group-member payer, disputes, event-state rules, settlements (partial, duplicate confirm, overpay blocked, SETTLED), notifications, admin dashboard / audit / health / problems / error logging, reports + CSV |
| Security (20) | `test/security.test.ts` | unauthenticated access, no self-registration, no privilege escalation, throttling, no secrets in logs, immutable audit, 403 on every admin endpoint, non-members isolated, non-event users rejected, private expense hidden on every read path (detail, list, search, timeline, activity, attachments, actions), privacy revoked on edit, IDOR on expenses / settlements, SQL injection, upload spoofing / oversize / traversal |

## End-to-end (manual, executed)
The seed script drives the real API (19 expenses in every state, settlements, uploads). The web build was driven in the built-in browser: login, dashboard, event settlement view, live split preview (unbalanced split rejected), expense creation, approval by a second user, admin dashboard, audit log, and health. See IMPLEMENTATION_REPORT.md for what was and was not covered.

## Not covered
No automated UI tests; no native device (Expo Go / emulator) run on this machine; no load testing.
