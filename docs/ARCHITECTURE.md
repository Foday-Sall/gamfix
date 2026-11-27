# GamFix architecture

One Laravel backend on a VPS, one site on Vercel, one Docker stack.

## Backend (`backend/`)

Laravel 12, pure JSON API. The only place with an environment file
(`backend/.env`).

Layers:

1. **Routes** (`routes/api.php`)
   - `/api/auth/...` — register, login, logout, Google redirect/callback.
   - `/api/me`, `/api/users/me` — session + profile (name, avatar, phone).
   - `/api/institutions`, `/api/categories` — public catalog.
   - `/api/config` — public realtime settings (where browsers reach the
     websocket server).
   - `/api/gamfix/...` — domain routes: complaint submit + photos, tracking,
     citizen confirm/reopen, phone OTP send/verify, staff console
     (accept/status/resolve/forward/proof, stats, map), admin panel,
     admin WhatsApp console, bot submit. `POST /api/gamfix/access` tells an
     account what it may open: `citizen`, `officer` or `admin`.
   - `/api/files/...` — signed complaint photos, avatars, institution logos.
   - `/api/broadcasting/auth` — private channel authorization for the
     Reverb websocket clients (Sanctum token auth).

2. **Models + MariaDB** — ULID keys, strict fillables, whitelisted field
   serialization (no mass-assignment surface).

3. **Auth**
   - Password login and Google sign-in → Sanctum tokens (opaque, revocable).
   - Every new account is a citizen. Officers are created by an institution
     administrator together with their institution; platform administrators
     are the e-mail addresses in `ADMIN_EMAILS`.

4. **Realtime — Laravel Reverb**
   - Every complaint create/update dispatches `ComplaintActivity`
     (Pusher-protocol broadcast via the `reverb` container).
   - Channels (all private, authorized at `/api/broadcasting/auth`):
     `institution.{id}` (its
     officers + admins), `admins` (the admin console).
   - Event payload: `{action, id, citizen_id, institution_id, status}` —
     no PII.
   - Clients connect to `wss://<REVERB_PUBLIC_HOST>/app/{REVERB_APP_KEY}`;
     the gateway proxies `/app/*` to `reverb:8080`.

5. **WhatsApp OTP** — `PhoneOtpService` posts to the GOWA gateway
   (`GOWA_BASE_URL`, basic auth, device id from env). 6-digit codes are
   hashed, rate-limited, single-use. Device linking is an operator step.

## Site (`frontend/`), deployed on Vercel

- `landing/` — static marketing page at `/`, no API calls.
- `web/` — the one web app at `/app`. One login page for everybody
  (`/app/login`). After signing in, the app asks `POST /api/gamfix/access`:
    a citizen gets the citizen screens (home, report wizard with photo
    compression + GPS, tracking, my reports, profile); an officer or
    administrator is taken to the staff console. Two documents inside the
    app: `index.html` (citizen screens, Tailwind CSS) and
    `dashboard/index.html` (staff console, Astryx + StyleX). The session is
    stored under `gamfix_auth`; realtime runs through pusher-js on
    `private-institution.{id}` and `private-admins`,
    with a 30-second poll as fallback.

`frontend/build-site.mjs` builds both into `frontend/dist` (landing at the
root, web app under `app/`); `vercel.json` routes the addresses, forwards
`/api` to the VPS and points install and build commands at the `frontend/`
folder — the landing page and the web app deploy together as one frontend on
one domain.

## Infra (`infra/docker/`)

`docker compose up -d --build` starts `gateway` (nginx: API and websockets,
everything else redirected to the site), `api` (php-fpm, migrate/seed on
boot), `reverb`, `mariadb`, `gowa` and `certbot` (TLS certificate). Every
setting comes from `backend/.env`.
