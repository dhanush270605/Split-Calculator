# Deployment (free options)

## API
Any host that runs Node 20+ with a **persistent disk** (SQLite file + uploads). Examples: your own PC/Raspberry Pi on the LAN, Fly.io / Railway / Render (check their current free tier and disk support).
```bash
cd server && npm ci && npm run build
NODE_ENV=production JWT_SECRET=<48+ random bytes> DB_PATH=/data/splitcalc.db UPLOAD_DIR=/data/uploads CORS_ORIGINS=https://your-web-host node dist/index.js
ADMIN_USERNAME=you ADMIN_PASSWORD='Str0ng!Pass1' npm run create-admin     # first admin, once
```
Put HTTPS in front (the platform's TLS or a reverse proxy). `trust proxy` is already enabled. Back up the `.db` file and the uploads dir regularly. **Do not run `npm run seed` in production** (it wipes data and creates demo accounts).

## Web build
`cd app && EXPO_PUBLIC_API_URL=https://api.example.com/api npx expo export --platform web` → static files in `app/dist/` (host on GitHub Pages / Netlify / any static host; SPA fallback to `index.html`).

## Android APK (not built in this repo's dev environment: no Java / Android SDK)
```bash
cd app && npm i -g eas-cli && eas login
# edit app/eas.json -> build.preview.env.EXPO_PUBLIC_API_URL
eas build -p android --profile preview     # cloud build, downloadable .apk (free tier is rate-limited)
```
For quick testing without a build: `npm run dev:app` and open in **Expo Go**, with `EXPO_PUBLIC_API_URL` pointing at the API reachable from the phone.

## GitHub
`.gitignore` excludes `node_modules`, builds, `.env*`, the DB, and uploads. See README for commands.
