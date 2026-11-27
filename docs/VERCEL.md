# Deploying the site to Vercel

The site is the landing page and the web app. It is built from the repository
root with one command and needs no settings or environment variables on
Vercel. The backend stays on the VPS (`docs/DEPLOY.md`).

## Import (once)

1. Vercel → **Add New… → Project** → import the `gamfix` repository.
2. Leave **Root Directory** at the repository root (`./`).
3. Click **Deploy**. Vercel runs `npm install` and `npm run build`
   (`scripts/build-site.mjs`), and takes `vercel.json` for everything else.

Every push to `main` deploys again.

## What is served

| Address                  | Content                                              |
| ------------------------ | ---------------------------------------------------- |
| `/`                      | landing page (`frontend/landing`)                    |
| `/privacy`, `/terms`     | landing page legal texts                             |
| `/app/...`               | web app: sign-in and citizen screens (`frontend/web`) |
| `/app/dashboard/...`     | staff console (same web app)                         |
| `/api/...`               | forwarded to the backend `https://51-44-152-213.sslip.io` |

Old addresses keep working through redirects in `vercel.json`: `/login`,
`/signup`, `/home`, `/track`, `/report`, `/profile`, `/my-reports`, `/verify/…`
go to `/app/…`; `/dash` and `/dash/…` go to `/app/dashboard…`; `/landing` goes
to `/`.

To use another backend, change the first rewrite in `vercel.json`.

## Settings that depend on the site address

The backend needs to know where the site is. In `backend/.env`:

```
APP_FRONTEND_URL=https://<project>-<scope>.vercel.app/app   # links in mails, Google sign-in
CORS_ORIGINS=https://*-<scope>.vercel.app                    # every deployment of the project
```

Then `docker compose up -d` on the server.

Google sign-in also needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` there
and the redirect URI `https://51-44-152-213.sslip.io/api/auth/google/callback`
in Google Cloud Console.

## Realtime

Vercel does not forward websockets, so the app connects to the backend
directly (`wss://51-44-152-213.sslip.io:443`). It reads that address from
`GET /api/config`; nothing to set on Vercel.

## Check it locally

```bash
npm run build
npm run preview        # http://localhost:4173 — same routing as Vercel, /api goes to the live backend
```

## Notes

- File uploads pass through Vercel (about 4.5 MB per request); the app
  compresses photos in the browser before uploading.
