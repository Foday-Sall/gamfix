# Deploying GamFix

Four ways to deploy, pick one:

0. **Current production layout (VPS: nginx + web Docker container + bare-metal PB)** — live since 2026-11-12
1. **All-in-one Docker (easiest, one command)** — new stacks
2. **Existing VPS, bare metal** — previous production layout
3. **Frontend-only to Cloudflare Pages or Vercel** — legacy, no longer used for production

---

## 0. Current production layout (2026-11-12)

Everything runs on the VPS (15.224.0.22), **no Cloudflare in the request
path** — Cloudflare DNS is authoritative but both records are DNS-only
(grey cloud):

| URL | Serves |
| --- | --- |
| `https://gamfix.pocketsoftware.dev/` | landing — **also the Google OAuth origin** |
| `https://gamfix.pocketsoftware.dev/login` (+ `/signup`, `/home`, `/report`, `/track`, `/profile`, `/my-reports`, `/verify/…`, `/forgot-password`, `/reset-password`) | citizen app — root paths |
| `https://gamfix.pocketsoftware.dev/app/…` | 301 → root equivalents (legacy) |
| `https://gamfix.pocketsoftware.dev/dash/` | staff dashboard |
| `https://gamfix.pocketsoftware.dev/api/…` | PocketBase (same origin) |
| `https://api.pocketsoftware.dev/api/…` | PocketBase API alias (external/mobile clients; non-API paths 404) |
| `https://15.224.0.22.sslip.io/…` | identical stack, direct-to-VPS fallback |

- **Frontend** runs in the `gamfix-web` Docker container
  (image from `infra/docker/web.Dockerfile`, port `127.0.0.1:8088`):
  landing + citizen app + dashboard snapshot, one nginx inside.
  Rebuild after changing sources:
  `sudo docker build -f /opt/gamfix-src/infra/docker/web.Dockerfile -t gamfix-web /opt/gamfix-src && sudo docker rm -f gamfix-web && sudo docker run -d --name gamfix-web --restart unless-stopped -p 127.0.0.1:8088:80 gamfix-web`
- **PocketBase** stays bare metal via systemd (`/opt/pocketbase`, port
  `127.0.0.1:8090`) so `pb_data` is untouched.
- **nginx** config: `/etc/nginx/sites-enabled/pocketbase` with shared
  snippets from `/etc/nginx/snippets/gamfix-*.conf` (also kept in
  `infra/nginx/`; push changes with `infra/nginx/deploy-nginx.sh`).
  Vhosts: `gamfix.pocketsoftware.dev` (UI + API — Google OAuth origin),
  `api.pocketsoftware.dev` (API alias for external/mobile clients),
  `15.224.0.22.sslip.io` (fallback). `backend.pocketsoftware.dev` was
  retired 2026-11-12 — nothing serves it anymore; a temporary bare
  `pocketsoftware.dev` vhost from that morning was removed the same day
  (the Google client ended up registered on the gamfix host).
- **Google OAuth2 ("Continue with Google")**: PB provider `google` lives in
  the `users` auth collection (`oauth2.providers`, PB 0.29 style) with
  client `635378998319-1vlgf5m586vk5pqhknm6vpdtckntfij0…` (secret rotated
  and stored server-side only on 2026-11-12). The Google client is
  registered for the **gamfix host** — JS origin
  `https://gamfix.pocketsoftware.dev`, redirect URI
  `https://gamfix.pocketsoftware.dev/api/oauth2-redirect` — and the PB JS
  SDK derives the redirect from the page origin, so the sign-in flow works
  on the gamfix domain. Verified 2026-11-12 end to end in a browser:
  Continue with Google → accounts.google.com sign-in page (no
  `redirect_uri_mismatch`), redirect_uri matching the registration.
- **Both frontends are built same-origin** (`VITE_POCKETBASE_URL=/`, the
  dashboard dist bundles patched to base `/`): whatever domain serves the
  app also serves the API, so there is no CORS and the Google OAuth
  redirect URI always matches the current origin. The citizen app builds
  with vite base `/` (root paths — `/login`, `/signup`, `/home`, …) and
  the landing with vite base `/landing/` (so `/` stays the marketing page
  and its "Get started" CTA links to `/login`); container nginx redirects
  legacy `/app/*` URLs to the root equivalents. PB `meta.appURL` is
  `https://gamfix.pocketsoftware.dev` (used by hooks for file/email URLs).
- **Certificates**: `certbot` webroot (`/var/www/certbot`).
  `/opt/gamfix-src/cert-issue.sh` + `gamfix-cert-issue.timer` retry
  issuance every 10 min until a domain's DNS points here, then disable
  themselves; renewal is certbot's own timer. NOTE (bug fixed 2026-11-12):
  the old placeholder logic wrote self-signed fallbacks through certbot's
  `live/` symlinks and could stomp the real cert in `archive/`; the script
  now always wipes the lineage and issues fresh, and `issued()` verifies
  the live cert is actually LE-signed (self-healing).
- **Realtime (SSE) gotcha — do not "fix"**: PB pins every realtime client
  to the IP that opened the SSE stream and rejects subscribes from a
  different IP (`Invalid realtime client.`). Mobile/CGNAT clients rotate
  IP between the EventSource GET and the subscribe POST, so
  `location = /api/realtime` must NOT forward `X-Real-IP` /
  `X-Forwarded-For` — PB then sees the constant loopback IP on both legs.
  SAME RULE for `location = /api/oauth2-redirect` (added 2026-11-12): PB's
  OAuth2 relay requires the callback request IP to equal the SSE client's
  stored IP, and `settings.trustedProxy` makes PB honour
  `X-Forwarded-For`. With XFF forwarded on that path, every "Continue with
  Google" hung forever (PB 307'd to `oauth2-redirect-failure`, the browser
  SDK never received the code → infinite spinner). Quick check when it
  happens again: `POST /api/realtime` logs 204 but the oauth2-redirect
  callback 307s to `-failure` in the nginx access log.
- **DNS** (Cloudflare is DNS-only everywhere — no proxy, no Workers;
  zone id `c8572c97c82c08908a88e18d3d38fb79`):
  `gamfix.pocketsoftware.dev` = A `15.224.0.22`, DNS-only (live).
  `api.pocketsoftware.dev` = A `15.224.0.22`, DNS-only (live, LE cert
  issued 2026-11-12). Both records were (re)created via the Cloudflare
  API that day — the gamfix record had been deleted from the zone, which
  took the whole site dark at the domain level. The bare
  `pocketsoftware.dev` deliberately has no A record (no vhost needs it).
  `backend.pocketsoftware.dev` is retired: its record was created by the
  Cloudflare Worker custom domain (gamfix-api) — remove it in Workers &
  Pages → gamfix-api → Settings → Domains & Routes; no vhost serves it
  anymore.
- No Cloudflare in the data path at all (since 2026-11-12): every React
  UI runs in the `gamfix-web` Docker container on the VPS; the old
  Cloudflare Pages / Worker configs are deleted from the repo (they live
  on in git history). CSP is now `connect-src 'self'` — the browser apps
  never talk cross-origin; `api.pocketsoftware.dev` is for external
  clients only.

---

## 1. All-in-one Docker

One command brings up everything: landing + citizen app + dashboard + API
(PocketBase with hooks/migrations baked in) + GOWA WhatsApp gateway.

Requirements: Docker with compose (`docker compose`, or legacy
`docker-compose` v1 — both work).

```bash
git clone https://github.com/Foday-Sall/gamfix.git && cd gamfix

# one-time: fetch a PocketBase binary for the image
./infra/docker/fetch-pb.sh                  # latest public release
# (or copy your exact production binary: ./infra/docker/fetch-pb.sh /path/to/pocketbase)

cd infra/docker
cp .env.example .env
# edit .env: set GOWA_PASS (shared basic auth), WEB_PORT, GOWA_PORT

docker compose up -d --build               # or: docker-compose up -d --build
```

That's it. You now have:

| URL | What |
| --- | --- |
| `http://<host>:$WEB_PORT/landing/` (+ `/` splash) | landing |
| `http://<host>:$WEB_PORT/` | citizen app (root paths; `/app/*` redirects) |
| `http://<host>:$WEB_PORT/dash/` | staff dashboard |
| `http://<host>:$WEB_PORT/api/` | PocketBase API |
| `http://<host>:$WEB_PORT/_/` | PocketBase admin UI |
| `http://127.0.0.1:$GOWA_PORT` (localhost only) | GOWA — QR scan / device management |

Finish setup:

```bash
# create the PocketBase admin account
docker compose exec pocketbase /pb/pocketbase superuser create \
  you@example.com 'StrongPassword!' --dir=/pb/pb_data

# link WhatsApp (SSH tunnel first if remote):
#   ssh -L 3001:127.0.0.1:3001 user@vps   then open http://localhost:3001
```

Data lives in named volumes (`pb_data`, `gowa_statics`, `gowa_storages`) —
survives restarts, back up `pb_data` regularly.

**TLS**: the web container speaks plain HTTP. Put it behind Cloudflare
(proxied DNS) or your own reverse proxy with Let's Encrypt.

---

## 2. Existing VPS, bare metal (current production layout)

Production runs: nginx (TLS, static frontends, API proxy) + PocketBase via
systemd + GOWA as a Docker container. Deploy changes with the script:

```bash
# on the VPS, with the repo at ~/gamfix
./scripts/deploy_vps_ui.sh citizen     # build + deploy citizen app
./scripts/deploy_vps_ui.sh landing     # build + deploy landing
./scripts/deploy_vps_ui.sh dashboard   # deploy dist snapshot (no build)
./scripts/deploy_vps_ui.sh server      # hooks + migrations, restart PB, smoke test
```

Every deploy timestamped-backups what it replaces; rollback example:

```bash
sudo cp -a /opt/gamfix-pocket/app.backup-<stamp>/. /opt/gamfix-pocket/app/
```

Verify after deploying:

```bash
curl -s https://<your-domain>/api/health
sudo journalctl -u pocketbase --since '5 min ago' --no-pager
```

Configs live in `infra/nginx/` and `infra/systemd/` if you ever need to
reinstall them.

---

## 3. Fresh VPS from scratch, bare metal (alternative to Docker)

### 3.1 PocketBase

```bash
sudo useradd -r -s /usr/sbin/nologin pocketbase
sudo mkdir -p /opt/pocketbase && cd /opt/pocketbase
# from https://github.com/pocketbase/pocketbase/releases (latest public release,
# v0.40.6 at the time of writing; production currently runs a custom 0.41.1 build)
wget https://github.com/pocketbase/pocketbase/releases/download/v0.40.6/pocketbase_0.40.6_linux_amd64.zip
sudo unzip pocketbase_0.40.6_linux_amd64.zip && sudo chown -R pocketbase:pocketbase /opt/pocketbase

# repo files
sudo -u pocketbase mkdir -p pb_hooks pb_migrations pb_data
sudo install -o pocketbase -g pocketbase -m 640 backend/pb_hooks/*.pb.js pb_hooks/
sudo install -o pocketbase -g pocketbase -m 640 backend/pb_migrations/*.js pb_migrations/

# environment for the hooks (WhatsApp gateway)
sudo tee /opt/pocketbase/gowa.env >/dev/null <<'EOF'
GOWA_BASE_URL=http://127.0.0.1:3000
GOWA_BASIC_AUTH=gowa:CHANGE_ME_STRONG_PASSWORD
GOWA_DEVICE_ID=
EOF
sudo chown pocketbase:pocketbase /opt/pocketbase/gowa.env && sudo chmod 640 /opt/pocketbase/gowa.env

sudo cp infra/systemd/pocketbase.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now pocketbase

# admin account (migrations run automatically on first start)
sudo -u pocketbase /opt/pocketbase/pocketbase superuser create \
  you@example.com 'StrongPassword!' --dir=/opt/pocketbase/pb_data
```

### 3.2 GOWA (WhatsApp gateway)

```bash
sudo apt install -y docker.io
sudo mkdir -p /opt/gowa/statics /opt/gowa/storages
sudo docker run -d --name gowa --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e APP_BASIC_AUTH=gowa:CHANGE_ME_STRONG_PASSWORD \
  -e APP_PORT=3000 -e APP_DEBUG=false -e APP_OS=Chrome \
  -e WHATSAPP_ACCOUNT_VALIDATION=false \
  -v /opt/gowa/statics:/app/statics -v /opt/gowa/storages:/app/storages \
  aldinokemal2104/go-whatsapp-web-multidevice:latest rest

# link the device (SSH tunnel if remote): ssh -L 3000:127.0.0.1:3000 user@vps
# open http://localhost:3000 and scan the QR
```

### 3.3 nginx + TLS + frontends

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp infra/nginx/gamfix-vps.conf /etc/nginx/sites-available/pocketbase
# edit server_name to your domain, then:
sudo ln -s /etc/nginx/sites-available/pocketbase /etc/nginx/sites-enabled/
sudo certbot --nginx -d your-domain.example
sudo systemctl reload nginx

# build + place the frontends
npm ci --prefix apps/citizen && npm run build --prefix apps/citizen
npm ci --prefix apps/landing && npm run build --prefix apps/landing
sudo mkdir -p /opt/gamfix-pocket
sudo rsync -a --delete apps/landing/dist/ /opt/gamfix-pocket/landing/
sudo rsync -a --delete apps/citizen/dist/ /opt/gamfix-pocket/app/
sudo rsync -a --delete apps/dashboard/dist/ /opt/gamfix-pocket/dash/
```

---

## 4. Frontend-only hosting (retired for production)

Production is the `gamfix-web` Docker container on the VPS (section 0) —
**no Cloudflare anywhere** (Pages and the gamfix-api Worker are retired,
their configs deleted from the repo; see git history if needed). The
notes below remain as fallback options for future static hosting.

### Cloudflare Pages (retired — do not use for production)

Was: landing at `/`, citizen app rewritten via `_redirects`. Gotchas if
ever revived: Pages 308-redirects `index.html` paths (rewrite targets
must be extension-less, app index named e.g. `app.html`); citizen built
with `--base=/` while the router basename follows `BASE_URL`; wrangler@3
with `CLOUDFLARE_ACCOUNT_ID` avoids the account-listing token scope.

### Vercel

Two projects (or monorepo), framework **Vite**:

- landing: root `apps/landing`, output `dist`
- citizen: root `apps/citizen`, output `dist`, env
  `VITE_POCKETBASE_URL=https://<api-host>`, plus SPA fallback
  `vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## Backups

PocketBase v0.41 has no backup CLI subcommand; backups are done through the
`/_/` admin UI (**Settings → Backups → Create backup**) or by copying the
data directory while the service is stopped:

```bash
# bare metal (brief downtime):
sudo systemctl stop pocketbase
sudo tar -czf /root/pb_data-backup-$(date -u +%Y%m%d).tar.gz -C /opt/pocketbase pb_data
sudo systemctl start pocketbase

# docker (no downtime needed for a copy):
docker compose exec pocketbase tar -C /pb -c pb_data | gzip > pb_data-backup.tar.gz
```

## Secrets policy

Never commit `gowa.env`, `.env`, SSH keys, superuser passwords, or API
tokens. The repo only ever contains `.example` templates.
