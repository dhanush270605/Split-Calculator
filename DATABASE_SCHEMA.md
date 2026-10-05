# Database schema (PostgreSQL)

Source of truth: [`server/src/db.ts`](server/src/db.ts). All money is `INTEGER` paise; timestamps are ISO-8601 UTC text. Foreign keys are ON; WAL mode.

| Table | Purpose / key columns |
|---|---|
| `users` | `username` (unique, NOCASE), `role` ADMIN/USER, `status` ACTIVE/INACTIVE/ARCHIVED, `password_hash` (bcrypt), `must_change_password`, `token_version` (bump = invalidate all sessions) |
| `events` | `type` TRIP/HACKATHON/HACKATHON_TRIP, `status` DRAFT/UPCOMING/ACTIVE/COMPLETED/CANCELLED/ARCHIVED, `visibility`, `CHECK(end_date >= start_date)` |
| `event_participants` | (event, user) unique, `status` ACTIVE/LEFT/REMOVED. Rows are never deleted |
| `hackathon_details`, `trip_details` | 1:1 with events (type-specific fields) |
| `itinerary_items`, `event_budgets`, `checklist_items` | schedule, budget by category, checklist (group-wide or per user) |
| `travel_segments`, `travel_passengers` | transport type, from/to, times (`CHECK arrival >= departure`), booked_by, payer, ticket amount, booking status |
| `expenses` | `amount_paise > 0`, `payer_type`, `payer_user_id`, `payer_name` (sponsor), `payer_confirmed`, `split_method`, `visibility` + `private_reason`, `status`, `version`, `idempotency_key` UNIQUE |
| `expense_allocations` | PK (expense, user); `share_paise`, `split_value`, `approval_status` PENDING/APPROVED/DECLINED |
| `disputes` | per expense: reason, message, status, resolution note, resolver |
| `settlements` | from→to, `amount_paise`, `status` PENDING/PAYMENT_INITIATED/PAID/CONFIRMED/DISPUTED/CANCELLED, `idempotency_key` UNIQUE, admin_note, `CHECK from<>to` |
| `attachments` | entity_type + entity_id, stored (random) name, magic-byte-verified mime, size |
| `notifications` | user, type, level, title/body, entity link, `read_at` |
| `audit_logs` | actor, action, entity, event, metadata / previous_state / new_state JSON. **UPDATE/DELETE blocked by triggers** |
| `system_errors` | level, source (api/database/notification/upload/storage/client), message, stack, context, resolved |
| `problem_reports` | user-submitted maintenance reports + admin status/note |

## Indexes
`event_participants(user_id,status)`, `expenses(event_id,spent_at)`, `expenses(creator_id)`, `expenses(payer_user_id)`, `expenses(status)`, `expense_allocations(user_id,approval_status)`, `settlements(event_id,status)`, `settlements(from,to)`, `notifications(user_id,read_at,created_at)`, `audit_logs(entity)`, `(event_id,created_at)`, `(actor_id,created_at)`, `(action,created_at)`, `system_errors(created_at)`, and others (see source).

## Consistency
- Derived financial values (balances, who-owes-whom) are **not stored**. They are computed from approved allocations plus confirmed settlements, so they cannot go stale.
- Expense + allocations + audit + notifications are written in a single transaction.
- `GET /api/admin/health` runs `PRAGMA quick_check` and `foreign_key_check`.
