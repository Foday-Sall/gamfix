# GamFix staff console (Astryx)

Staff and admin dashboard for GamFix SL — institution officers and the platform
administrator manage citizen reports from here. Built with **React 19 + Vite +
[Astryx](https://github.com/meta/astryx)** (Meta's design system) using the
**Matcha** theme, StyleX for component styling, Leaflet for the map.

Served at **/dash/** on the VPS (nginx SPA fallback) — same-origin with the
PocketBase API, so no CORS setup is needed.

## Develop

```bash
npm install
npm run dev        # vite dev server; /api is proxied to the live VPS
```

## Build & deploy

```bash
npm run build      # outputs dist/ (base /dash/)
rsync -a --delete dist/ user@vps:/opt/gamfix-pocket/dash/
```

The Docker web image builds this app the same way (see `infra/docker/web.Dockerfile`).

## Pages

| Route | Who | What |
| --- | --- | --- |
| `/` | admin + officer | Overview: KPI cards, 14-day trend chart, category/status breakdowns |
| `/complaints` | admin + officer | Complaint feed with search + status filters; detail dialog with accept / start work / report fix / request info / reject / forward / attach proof actions |
| `/map` | admin + officer | Live Leaflet map (OpenStreetMap) of GPS-tagged complaints, scoped server-side |
| `/institutions` | admin | Institution directory, create institutions |
| `/accounts` | admin | Officer accounts: invite (one-time temporary password), activate/deactivate |
| `/access` | admin | Per-institution access level, SLA hours, daily rate limit, category scope |
| `/audit-log` | admin | Admin audit trail with filter |
| `/whatsapp` | admin | WhatsApp device registry via GOWA: pairing codes, role (otp/chat), revoke, delete |
| `/settings` | admin | Dashboard settings JSON document |

## Backend contract

All privileged actions go through the server-verified hook routes
(`backend/pb_hooks/`) — the browser never supplies institution IDs or roles:

- `POST /api/gamfix/access` — role routing after PocketBase auth
- `POST /api/gamfix/staff/*` — officer feed, stats, detail, lifecycle actions, map
- `POST /api/gamfix/admin` — 14 admin panel actions (`{action, params}`)
- `POST /api/gamfix/admin-whatsapp` — GOWA device management

The admin identity is the exact-email allowlist (`admin@pocketsoftware.dev`
with `role=admin`); officers must have an active row in the `officers`
directory matching their `users.institution`.
