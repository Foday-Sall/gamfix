# GamFix web app

One React app for everybody who signs in: the citizen screens (home, report,
track, profile) and the staff console for institution officers and platform
administrators. It replaces the former separate citizen app and dashboard.

Which side an account sees is decided after login by the server
(`POST /api/gamfix/access`), never by the address that was opened:

| Account                   | Sees                                       |
| ------------------------- | ------------------------------------------ |
| citizen                   | `/app/home`, `/app/report`, `/app/track` … |
| officer or administrator  | `/app/dashboard` …                         |

Opening `/app/dashboard` as a citizen returns you to `/app/home`. Opening a
citizen page as staff takes you to the console. All accounts use the same
sign-in page, `/app/login`; the console has no login of its own.

## How it is built

- React 19, Vite, Tailwind CSS and React Router.
- Two documents: `index.html` (citizen screens and sign-in) and
  `dashboard/index.html` (staff console, with its own design system: Astryx and
  StyleX). Switching between them is a full page load.
- No environment variables are needed. The app calls `/api` on the address it
  is opened from (Vercel forwards `/api` to the server) and reads the realtime
  settings from `GET /api/config`.
- The session is kept in local storage under `gamfix_auth`.

## Run locally

```
npm install
npm run dev
```

The dev server (`http://localhost:5173`) proxies `/api` to
`https://51-44-152-213.sslip.io`; set `VITE_DEV_API` to use another backend.
The console is at `http://localhost:5173/dashboard`.

Optional build-time overrides, for setups other than Vercel:
`VITE_API_BASE_URL` (default `/`, the address the page is opened from) and
`VITE_REVERB_APP_KEY`, `VITE_REVERB_HOST`, `VITE_REVERB_PORT`,
`VITE_REVERB_SCHEME` (default: taken from `/api/config`).

## Build

`npm run build` in the repository root builds the whole site
(`scripts/build-site.mjs`): this app is built with `BASE_URL=/app/` and ends up
in `dist/app/`. To build this app on its own, run `npm run build` here.
