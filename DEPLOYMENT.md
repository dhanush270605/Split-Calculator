# Deployment (free tier, works without your laptop)

```
Android APK  ──HTTPS──▶  Render (free web service, auto-deploys from GitHub main)  ──▶  Neon (free Postgres)
```

| Part | Where | Updated by |
|---|---|---|
| Backend `server/` | Render free web service | `git push` to `main` (auto-deploy) |
| Database | Neon free Postgres (0.5 GB) | schema is created/updated automatically on boot |
| App `app/` | Android APK built by EAS | JS/asset changes: `eas update`; native changes: new `eas build` |

Free-tier limits: Render free instances **sleep after ~15 min idle** (first request takes 30-60 s; the app shows "Waking up the server…" and retries). Neon free pauses compute when idle (adds ~1 s). EAS free builds are queued and limited per month.

## 1. Database (Neon) - 2 minutes
1. https://neon.tech → sign up → create a project (any region near you; Singapore for India).
2. Dashboard → **Connection string** → copy the one that starts with `postgresql://…` (keep `sslmode=require`).

## 2. Backend (Render) - 3 minutes
1. https://render.com → sign up with GitHub → **New → Blueprint** → select `dhanush270605/Split-Calculator` (it reads `render.yaml`).
2. Render asks for the values marked `sync: false`:
   - `DATABASE_URL` = the Neon string from step 1
   - `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD` = your first admin login (choose a strong password; min 8 chars with letters and digits)
   - (optional) `SEED_DEMO` = `true` once, to create the 10 demo users + 3 demo events in the empty database. Set it back to `false` afterwards.
3. Click **Apply**. `JWT_SECRET` is generated for you. When the deploy is green open `https://<service>.onrender.com/api/health`: it must show `{"status":"ok","db":"up"}`.
4. The service name in `render.yaml` is `split-calculator-api`, so the URL is normally `https://split-calculator-api.onrender.com`. If Render gave a different URL, see "Changing the API URL" below.

From now on every push to `main` redeploys the backend automatically.

## 3. Android app
```powershell
cd app
npx eas-cli login                                   # once
npx eas-cli build -p android --profile preview      # builds an installable .apk in Expo's cloud; prints a download link + QR
```
The API URL is baked in from `app/eas.json` (`EXPO_PUBLIC_API_URL`) with `app.json → expo.extra.apiUrl` as fallback.

### Updating the app later
- **JavaScript / UI / asset change** (most changes): `cd app ; npx eas-cli update --channel preview --message "what changed"`. Installed apps fetch it on next launch. No reinstall.
- **New native module, permission, Expo SDK upgrade, app name/icon**: run `eas build` again and reinstall.
- **Backend change**: `git push` only.
- Keep API changes backward compatible with already-installed apps (add fields; don't remove or rename).

### Changing the API URL (no rebuild needed)
Edit `EXPO_PUBLIC_API_URL` in `app/eas.json` **and** `expo.extra.apiUrl` in `app/app.json`, then `npx eas-cli update --channel preview`.

## Local development
`npm run install:all` → `npm run seed` (embedded Postgres in `server/data/pglite`, no install needed) → `npm run dev:api` → `npm run dev:app` (Expo Go). In dev builds the app derives the API from the Expo dev host automatically.

## Operations
- Health: `GET /api/health` (public, DB-aware). Admin → System health shows errors and DB status.
- Backups: Neon keeps point-in-time history on the free plan (short window); export with `pg_dump "$DATABASE_URL"` for your own copies.
- Never run the seed against production unless you want demo accounts (`SEED_REMOTE=yes` is required for remote seeding; `SEED_DEMO` only seeds an *empty* DB).
