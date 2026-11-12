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
| `https://gamfix.pocketsoftware.dev/` | landing |
| `https://gamfix.pocketsoftware.dev/app/` | citizen app |
| `https://gamfix.pocketsoftware.dev/dash/` | staff dashboard |
| `https://gamfix.pocketsoftware.dev/api/…` | PocketBase (same origin) |
| `https://15.224.0.22.sslip.io/…` | identical stack, direct-to-VPS fallback |

- **Frontend** runs in the `gamfix-web` Docker container
  (image from `infra/docker/web.Dockerfile`, port `127.0.0.1:8088`):
  landing + citizen app + dashboard snapshot, one nginx inside.
  Rebuild after changing sources:
  `sudo docker build -f /opt/gamfix-src/infra/docker/web.Dockerfile -t gamfix-web /opt/gamfix-src && sudo docker rm -f gamfix-web && sudo docker run -d --name gamfix-web --restart unless-stopped -p 127.0.0.1:8088:80 gamfix-web`
- **PocketBase** stays bare metal via systemd (`/opt/pocketbase`, port
  `127.0.0.1:8090`) so `pb_data` is untouched.
- **nginx** config: `/etc/nginx/sites-available/pocketbase` with shared
  snippets from `/etc/nginx/snippets/gamfix-*.conf` (also kept in
  `infra/nginx/`). Vhosts: `gamfix.pocketsoftware.dev` (UI + API),
  `backend.pocketsoftware.dev` (API alias),
  `15.224.0.22.sslip.io` (fallback).
- **Both frontends are built same-origin** (`VITE_POCKETBASE_URL=/`, the
  dashboard dist bundles patched to base `/`): whatever domain serves the
  app also serves the API, so there is no CORS and the Google OAuth
  redirect URI always matches the current origin.
- **Certificates**: `certbot` webroot (`/var/www/certbot`).
  `/opt/gamfix-src/cert-issue.sh` + `gamfix-cert-issue.timer` retry
  issuance every 30 min until a domain's DNS points here, then disable
  themselves; renewal is certbot's own timer.
- **Realtime (SSE) gotcha — do not "fix"**: PB pins every realtime client
  to the IP that opened the SSE stream and rejects subscribes from a
  different IP (`Invalid realtime client.`). Mobile/CGNAT clients rotate
  IP between the EventSource GET and the subscribe POST, so
  `location = /api/realtime` must NOT forward `X-Real-IP` /
  `X-Forwarded-For` — PB then sees the constant loopback IP on both legs.
- **DNS**: `gamfix.pocketsoftware.dev` = A `15.224.0.22`, DNS-only.
  `backend.pocketsoftware.dev` is still held by a read-only record
  created by the retired Cloudflare Worker custom domain — detach it
  (Workers & Pages → gamfix-api → Settings → Domains & Routes → remove),
  then set the same A record; the cert timer picks the rest up.
- The Cloudflare Pages project and the `gamfix-api` Worker are retired:
  no traffic reaches them once DNS is grey-cloud (gamfix) and the worker
  domain is detached (backend).

---

## 1. All-in-one Docker

One command brings up everything: landing + citizen app + dashboard + API
(PocketBase with hooks/migrations baked in) + GOWA WhatsApp gateway.

Requirements: Docker with compose (`docker compose`, or legacy
`docker-compose` v1 — both work).

```bash
git clone https://github.com/Foday-Sall/gamfix-SL.git && cd gamfix-SL

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
| `http://<host>:$WEB_PORT/` | landing |
| `http://<host>:$WEB_PORT/app/` | citizen app |
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
# on the VPS, with the repo at ~/gamfix-SL
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

## 4. Frontend-only: Cloudflare Pages / Vercel

The frontends are static SPAs talking to the PocketBase API over HTTPS
(CORS is open), so they can be hosted anywhere.

### Cloudflare Pages (current production for gamfix.pocketsoftware.dev)

Production layout: **landing at `/`**, citizen app routes (`/login`,
`/report`, ...) rewritten to the app bundle via `_redirects`
(`infra/cloudflare-pages/_redirects`).

**Gotchas (learned the hard way):**
- Pages 308-redirects any path ending in `index.html` and strips `.html`
  from all HTML files — rewrite targets must be extension-less
  (`/app/app`, `/landing`) and the app index must be named e.g. `app.html`.
- The citizen app for Pages builds with `--base=/` (VPS build uses the
  default `base /app/`); the router basename follows `BASE_URL`, so one
  source serves both.
- wrangler v4.160+ requires an account-listing token scope; use
  `wrangler@3` with `CLOUDFLARE_ACCOUNT_ID`, or grant Account read.

```bash
cd apps/citizen
npm ci && npx vite build --base=/ --outDir=dist-pages --emptyOutDir
# assemble a deploy dir:
#   landing dist at root (index.html + assets),
#   app dist-pages index.html renamed to app/app.html (keep its /assets refs),
#   _redirects at the deploy root
export CLOUDFLARE_API_TOKEN=<token with Cloudflare Pages Edit>
export CLOUDFLARE_ACCOUNT_ID=<account id>
npx wrangler@3 pages deploy <deploy-dir> --project-name=gamfix --branch=main --commit-dirty=true
```

The app bundle must point at the VPS API via `VITE_POCKETBASE_URL`
(`apps/citizen/.env.production`).

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
