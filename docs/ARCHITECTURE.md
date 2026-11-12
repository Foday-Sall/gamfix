# GamFix architecture

Civic-tech app for The Gambia: citizens report infrastructure problems
(garbage, broken lights, damaged roads...), attach photos and GPS, and staff
of institutions (officers/admins) process the reports.

```
                       ┌──────────────────────────── VPS ────────────────────────────┐
Citizens (browser)  ──►│  nginx :80/:443                                             │
Staff / admins      ──►│   /          landing          /dash/    staff dashboard     │
                       │   /app/      citizen app      /api/  ──►  PocketBase :8090  │
                       │                                             │  pb_hooks (JS)│
                       │                                             │  pb_data (SQL)│
                       │                                             └──► GOWA :3000 │──► WhatsApp
                       └─────────────────────────────────────────────────────────────┘
Cloudflare Pages (gamfix.pocketsoftware.dev) serves landing at / and the
citizen app at its routes; the Pages bundle calls the VPS PocketBase API.
```

## Components

| Path | What it is |
| --- | --- |
| `apps/citizen/` | Citizen app — React + Vite + Tailwind, talks to PocketBase via the official JS SDK. Routes: `/login`, `/signup`, `/report`, `/track`, `/my-reports`, `/profile`, `/onboarding`, `/verify/email`, `/verify/phone`, `/forgot-password`, `/reset-password`, `/institute`, `/home`. |
| `apps/landing/` | Marketing site. Static, no API calls. |
| `apps/dashboard/` | Staff/admin console. **Dist snapshot only — source was lost** (was a separate build phase). Deploy as-is. |
| `backend/pb_hooks/` | The whole API layer. PocketBase executes these JS hooks on every request — there is no other custom backend code. |
| `backend/pb_migrations/` | Schema migrations; run automatically when PocketBase starts. |

## PocketBase hooks (backend/pb_hooks/)

| Hook | Purpose |
| --- | --- |
| `gamfix.pb.js` | Citizen report lifecycle: create report (photo guard, GPS), track by number, resolution flow. Also RBAC guards (admin allowlist `admin@pocketsoftware.dev`). |
| `phone-otp.pb.js` | WhatsApp OTP login: sends a 6-digit code through GOWA, verifies it, returns a PocketBase auth token. Reads `GOWA_BASE_URL`, `GOWA_BASIC_AUTH`, `GOWA_DEVICE_ID` from the environment. |
| `email-otp.pb.js` | Email OTP login + user-field guards: same code-by-email flow for users without WhatsApp. |
| `staff-actions.pb.js` | Officer actions on reports (accept, status updates, resolution). |
| `staff-admin.pb.js` | Staff console API: feed, stats, report detail, map data. |
| `staff-admin2.pb.js` | Admin panel actions (14 panel routes) + `/admin-secrets`. |
| `staff-admin3.pb.js` | `/admin-whatsapp`: GOWA device lifecycle from the admin panel. |

All staff/admin routes re-check role/permissions server-side on every request;
client IP is captured for report creation; phones are validated Gambian-only
(`+220`) server-side.

### Why custom OTP code when PocketBase has email/SMTP?

PocketBase has built-in **SMTP email sending** (verification emails, password
resets — configured in the `/_/` admin UI under Settings → Mail settings) and
built-in auth with **passwords and OAuth2** — but **no built-in OTP login**
flow. GamFix chose code-based login (no passwords for citizens), so:

- **Email OTP** (`email-otp.pb.js`) is custom code that generates a code and
  sends it *through PocketBase's built-in SMTP mailer* (`$app.newMailer()`)
  — the SMTP part is stock PocketBase, only the code/verify logic is custom.
- **Phone/WhatsApp OTP** (`phone-otp.pb.js`) has no PocketBase equivalent at
  all, so it calls **GOWA** (go-whatsapp-web-multidevice), a self-hosted
  WhatsApp gateway, to deliver codes.

## Environment variables (PocketBase side)

| Var | Meaning |
| --- | --- |
| `GOWA_BASE_URL` | GOWA API base URL (default `http://127.0.0.1:3000`; `http://gowa:3000` in Docker). |
| `GOWA_BASIC_AUTH` | `user:password` used by hooks when calling GOWA. |
| `GOWA_DEVICE_ID` | Linked WhatsApp device id (default fallback baked in hook). |

## Deployment layouts

- **Bare-metal VPS (current production)**: nginx serves the built frontends
  from `/opt/gamfix-pocket/` and proxies `/api/` to PocketBase (systemd
  service at `/opt/pocketbase/`); GOWA runs as a Docker container.
- **All-in-one Docker** (`infra/docker/`): `docker compose up -d --build`
  brings up web (nginx with all frontends built from source) + PocketBase
  (hooks/migrations baked into the image) + GOWA. See `docs/DEPLOY.md`.
- **Cloudflare Pages**: landing at `/`, citizen app routes rewritten via
  `_redirects`; the app bundle points at the VPS API.

## Known source drift (honest note)

The exact source of the last UI iteration of 2026-11-12 was partially lost
with the dev environment. What is current in this repo:

- all backend hooks and migrations (pulled from the live server),
- the landing app (rebuilds byte-identical to production),
- the citizen app, **except** three changes that exist in production only in
  compiled form: the mandatory WhatsApp onboarding step after Google OAuth,
  Gambian-only `+220` client-side validation, and (restored from notes)
  the `basename`-from-`BASE_URL` router fix, which IS applied here.

The compiled production citizen app + dashboard are preserved in
`apps/dashboard/` (dashboard) — for the citizen app, rebuild from source.

## History

The original UI was taken 1:1 from the public Supabase-era repo
(`Foday-Sall/gamfix`) and fully ported to PocketBase. That earlier repo
remains on GitHub for reference; this repo is the source of truth.
