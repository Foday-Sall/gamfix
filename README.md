# GamFix SL

Civic-tech app for The Gambia: citizens report infrastructure problems
(garbage, broken lights, damaged roads...), attach photos and GPS, and staff
of institutions (officers/admins) process the reports until they are fixed.

- **Backend**: PocketBase (single Go binary + SQLite) with the entire API
  implemented as JS hooks — no other server code.
- **Frontends**: React + Vite + Tailwind (citizen app, landing site) and a
  staff/admin dashboard (compiled snapshot in production; reference source
  in `apps/dashboard/src`, see `docs/ARCHITECTURE.md`).
- **WhatsApp OTP**: self-hosted GOWA gateway (go-whatsapp-web-multidevice).

## Repository layout

```
gamfix/
├── apps/
│   ├── citizen/        citizen app source (React + Vite + Tailwind + PB JS SDK)
│   ├── landing/        marketing site source (static, no API calls)
│   └── dashboard/      staff/admin console — DIST ONLY (source lost)
├── backend/
│   ├── pb_hooks/       PocketBase JS hooks = the whole API layer
│   └── pb_migrations/  schema migrations (run automatically on PB start)
├── infra/
│   ├── docker/         one-command Docker stack: web + PocketBase + GOWA
│   ├── nginx/          nginx site config (bare-metal VPS layout)
│   └── systemd/        systemd units + cert-issue.sh (PocketBase, LE certs)
├── scripts/
│   └── deploy_vps_ui.sh  build + deploy to the existing bare-metal VPS
└── docs/
    ├── DEPLOY.md         step-by-step deployment guide (Docker / VPS / Pages / Vercel)
    └── ARCHITECTURE.md   how the system works, hook inventory, env vars
```

## Quick start

```bash
# 1. Full stack in one command (Docker):
cd infra/docker && cp .env.example .env   # set GOWA_PASS
docker compose up -d --build

# 2. Or local development:
#    PocketBase (download the v0.41 binary first):
pocketbase serve --hooksDir=backend/pb_hooks --dir=backend/pb_data
#    citizen app:
npm ci --prefix apps/citizen && npm run dev --prefix apps/citizen
```

Full instructions: **`docs/DEPLOY.md`** — Docker one-command stack, fresh
bare-metal VPS (nginx + systemd + GOWA), redeploying the existing VPS, and
frontend-only hosting on Cloudflare Pages or Vercel.

## Auth funnel (how sign-in works)

Every citizen completes the same funnel, enforced both client- and
server-side, in this order — no step can be skipped, whichever way you sign in:

```
sign up / sign in (password form or Google popup)
  → 1. verify email        (6-digit code; the FIRST code is sent by the
                            verify screen itself on mount — "sendNow")
  → 2. confirm your name   (/onboarding; Google accounts prefill from
                            the Google profile, full_name stays empty
                            server-side until the user confirms)
  → 3. verify phone        (6-digit code on WhatsApp via GOWA; server
                            route refuses users with unverified email)
  → 4. /home
```

- Google accounts are no longer exempt from phone verification, and an
  unverified email can never reach phone OTP (the `/api/gamfix/phone-otp/*`
  hooks return 403, and the AppShell gate + page guards route to the right
  step).
- After the Google popup resolves, the app routes immediately — no manual
  browser refresh needed (`routeAfterAuth` in `apps/citizen/src/pages/Auth.tsx`).
- OTP codes live in the PocketBase process store: they expire with a PB
  restart, and each send is rate-limited to one per 60 s per user.

## Live deployment reference (2026-11-12)

- VPS `15.224.0.22` (AWS Lightsail, eu-west-3): nginx on 80/443,
  PocketBase (systemd) at `127.0.0.1:8090`, GOWA at `127.0.0.1:3000` (Docker),
  web container `gamfix-web` at `127.0.0.1:8088` (built from this repo's
  `infra/docker/web.Dockerfile`).
- Citizen app + landing: https://gamfix.pocketsoftware.dev (nginx vhost in
  front of the web container; same origin serves `/api` → PocketBase).
- API alias: https://api.pocketsoftware.dev · Dashboard: https://gamfix.pocketsoftware.dev/dash/
- Mail: SMTP via Resend (`noreply@pocketsoftware.dev`); DNS carries Resend
  DKIM + SPF (`include:amazonses.com`) + DMARC — without those, Gmail
  greylists the OTP mails and they arrive late.

## Secrets policy

Never commit `.env`, `gowa.env`, SSH keys, superuser passwords or API
tokens — only `*.example` templates belong in the repo.
