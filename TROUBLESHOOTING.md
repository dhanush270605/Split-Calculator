# Troubleshooting

| Symptom | Fix |
|---|---|
| App says "Cannot reach the server" | API not running (`npm run dev:api`), or wrong URL. Set `EXPO_PUBLIC_API_URL`. On a phone use the PC's LAN IP and allow port 4000 in the firewall. Android emulator uses `10.0.2.2`. |
| 401 right after login on web | Browser blocked storage, or the API restarted with a random dev `JWT_SECRET`. Set a fixed `JWT_SECRET` in your env, then sign in again. |
| `better-sqlite3` install fails | Use Node 20/22 LTS (prebuilt binaries). Otherwise install Windows build tools or `node-gyp` prerequisites. |
| Seed says users exist | `npm run seed` deletes `server/data/*` first. Stop the API before reseeding (Windows file lock). |
| Login blocked ("Too many failed attempts") | Wait 15 min or restart the API (the throttle is in-memory). |
| "Expenses cannot be added while the event is completed" | By design. An admin can set the event back to Active/Upcoming. |
| "Amount exceeds what you owe" when settling | Only approved shares count, and amounts already marked paid (unconfirmed) are reserved. |
| Upload rejected | Only JPG/PNG/WEBP/PDF up to 5 MB. The file is checked by content, not extension. |
| Expo web shows blank page | Clear cache: `cd app && npx expo start --clear`. |
| Admin: see what went wrong | Admin → System health & errors; the API also logs to the console. |
