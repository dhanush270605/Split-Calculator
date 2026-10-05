# Troubleshooting

| Symptom | Fix |
|---|---|
| App says "Can't connect to the server" (release APK) | The API URL baked into the build is wrong or the API is down. Open `https://<your-api>/api/health` in the phone's browser. It must show `{"status":"ok","db":"up"}`. If the URL differs from `app/eas.json`/`app.json`, fix both and run `npx eas-cli update --channel preview`. |
| First sign-in takes ~1 minute | Render's free instance was asleep ("Waking up the server…"). It is fast again for the next ~15 minutes. |
| App shows `http://10.0.2.2:4000/api` | Old build/dev config: `10.0.2.2` only works on the Android *emulator*. Use a build made after v1.2.0 (production URL), or in dev run `npm run dev:app` so the app uses the dev machine's LAN IP. |
| Dev: "Cannot reach the server" in Expo Go | API not running (`npm run dev:api`), phone not on the same Wi-Fi, or Windows Firewall blocks port 4000. |
| 401 right after login | The API restarted with a random dev `JWT_SECRET`. Set a fixed `JWT_SECRET`, then sign in again. (Render generates a fixed one.) |
| Render deploy fails: `DATABASE_URL must be set` | Add the Neon connection string in Render → Environment. |
| Render logs: `no pg_hba.conf` / SSL errors | Use the Neon string with `sslmode=require`; the server enables SSL for non-local hosts automatically. |
| No users exist after first deploy | Set `BOOTSTRAP_ADMIN_USERNAME` + `BOOTSTRAP_ADMIN_PASSWORD` (or `SEED_DEMO=true`) in Render and redeploy; they only act on an empty database. |
| Local seed won't run | Stop `npm run dev:api` first (file lock), then `npm run seed` (recreates `server/data/pglite`). |
| Login blocked ("Too many failed attempts") | Wait 15 min or restart the API (the throttle is in-memory). |
| "Expenses cannot be added while the event is completed" | By design. An admin can set the event back to Active/Upcoming. |
| "Amount exceeds what you owe" when settling | Only approved shares count, and amounts already marked paid (unconfirmed) are reserved. |
| Upload rejected | Only JPG/PNG/WEBP/PDF up to 4 MB. The file is checked by content, not extension. |
| Admin: see what went wrong | Admin → System health & errors; Render → Logs. |
