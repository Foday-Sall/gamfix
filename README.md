# GamFix SL

Civic-tech app for The Gambia: citizens report infrastructure problems
(garbage, broken lights, damaged roads...), attach photos and GPS, and staff
of institutions (officers/admins) process the reports until they are fixed.

- **Backend**: PocketBase (single Go binary + SQLite) with the entire API
  implemented as JS hooks — no other server code.
- **Frontends**: React + Vite + Tailwind (citizen app, landing site) and a
  staff/admin dashboard (dist snapshot; source lost, see `docs/ARCHITECTURE.md`).
- **WhatsApp OTP**: self-hosted GOWA gateway (go-whatsapp-web-multidevice).

## Repository layout

```
gamfix-SL/
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
│   ├── systemd/        pocketbase.service unit (bare-metal VPS)
│   └── cloudflare-pages/  _redirects + deploy script for Cloudflare Pages
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

## Live deployment reference (2026-11-12)

- VPS `15.224.0.22` (AWS Lightsail, eu-west-3): nginx on 80/443,
  PocketBase at `127.0.0.1:8090`, GOWA at `127.0.0.1:3000` (Docker)
- Citizen app: https://gamfix.pocketsoftware.dev (Cloudflare Pages) and
  https://15.224.0.22.sslip.io/app/
- Dashboard: https://15.224.0.22.sslip.io/dash/

## Secrets policy

Never commit `.env`, `gowa.env`, SSH keys, superuser passwords or API
tokens — only `*.example` templates belong in the repo.
