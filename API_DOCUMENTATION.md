# API (base `/api`, JSON, `Authorization: Bearer <jwt>`)

Errors: `{ "error": { "code", "message", "details?" } }`. 400 validation, 401 auth, 403 forbidden, 404 hidden/not found, 409 conflict/state, 413 file too large, 429 throttled, 500 logged + generic message.
Money fields are integer paise (`amountPaise`). Percentages are basis points (`5000` = 50%). Lists are paginated with `limit` / `offset`.

## Auth
| | |
|---|---|
| `POST /auth/login` `{username,password}` | → `{token,user}` (throttled, audited) |
| `GET /auth/me`, `POST /auth/logout` | |
| `POST /auth/change-password` | invalidates old tokens, returns a new one |
| `PATCH /auth/profile` | email, phone, college, department, year, emergencyContact only |

## Users (admin)
`GET /users?search&status` · `POST /users` (returns one-time `temporaryPassword` if none supplied) · `GET|PATCH /users/:id` · `POST /users/:id/status` · `POST /users/:id/reset-password` · `GET /users/:id/activity`

## Events
`GET /events?search&status&type` · `POST /events` (admin) · `GET /events/:id` · `PATCH /events/:id` (admin; extension / status change are specially audited) ·
`POST /events/:id/participants` · `DELETE /events/:id/participants/:userId` · `POST /events/:id/leave` · `POST /events/:id/checklist` · `POST /events/:id/checklist/:itemId/toggle` ·
`GET /events/:id/timeline` · `GET /events/:id/activity` · `GET /events/:id/summary` · `GET /events/:id/settlement` · `GET|POST /events/:id/travel` · `PATCH /travel/:id`

## Expenses
`GET /expenses?eventId&category&status&visibility&payerId&paymentMethod&from&to&minAmount&maxAmount&mine&search`
`POST /expenses` (`idempotencyKey` recommended) · `GET|PATCH /expenses/:id` (`expectedVersion` required) ·
`POST /expenses/preview` · `POST /expenses/:id/respond {decision: APPROVE|DECLINE, note}` · `POST /expenses/:id/cancel` · `POST /expenses/:id/dispute` ·
`GET /approvals` · admin: `GET /disputes`, `POST /disputes/:id/resolve {status,note}`

## Settlements
`GET /settlements` · `POST /settlements {eventId,toUserId,amountPaise,method,idempotencyKey}` ·
`POST /settlements/:id/(pay|confirm|dispute|cancel|admin-override)`

## Attachments
`POST /attachments` (multipart: `file`, `entityType`, `entityId`, `kind`; JPG/PNG/WEBP/PDF ≤ 5 MB) · `GET /attachments/:id` (authorized stream) · `DELETE /attachments/:id`

## Notifications / problems / reports
`GET /notifications?unread&level&type&search` · `GET /notifications/unread-count` · `POST /notifications/:id/read` · `POST /notifications/read-all` · `POST /notifications/broadcast` (admin) ·
`POST /problems` · `GET /problems/mine` · `POST /client-errors` · `GET /dashboard/me` · `GET /reports/me`

## Admin only (`/admin/*`)
`GET /admin/dashboard` · `GET /admin/audit?actorId&action&entityType&entityId&eventId&search` · `GET /admin/errors` · `POST /admin/errors/:id/resolve` · `GET /admin/health` ·
`GET /admin/problems` · `PATCH /admin/problems/:id` · `GET /admin/reports/event/:id[?format=csv]`
