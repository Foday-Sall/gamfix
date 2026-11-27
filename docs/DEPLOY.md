# Deploying the GamFix backend on a VPS (Docker)

The VPS runs the backend only: API, websockets, database and the WhatsApp
gateway. The site (landing page and web app) is deployed on Vercel
(`docs/VERCEL.md`); the server sends every other address there.

## 1. Environment

There is one environment file in the project, `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Fill in every line marked `CHANGE ME` (`APP_KEY`, `DB_PASSWORD`,
`DB_ROOT_PASSWORD`, `GOWA_PASS`, `REVERB_APP_KEY`, `APP_KEY` (generate with `php artisan key:generate` — startup refuses to run without it),
`REVERB_APP_SECRET`). `infra/docker/.env` is a symlink to that file, so
Docker reads the same file and nothing has to be set twice.

## 2. Start

```bash
cd infra/docker
docker compose up -d --build
```

| Service    | What it does                                                            |
| ---------- | ----------------------------------------------------------------------- |
| `gateway`  | nginx: answers on ports 80 and 443                                      |
| `api`      | Laravel (php-fpm); migrates and seeds on every start                    |
| `reverb`   | websocket server                                                        |
| `mariadb`  | database (volume `docker_mariadb_data`)                                 |
| `gowa`     | WhatsApp gateway; its QR page is on `127.0.0.1:3001` of the server      |
| `certbot`  | issues and renews the TLS certificate                                   |

What the gateway answers:

| Address                        | Goes to                                          |
| ------------------------------ | ------------------------------------------------ |
| `/api/*`, `/up`                | the Laravel API                                  |
| `/app/*`                       | the websocket server                             |
| `/.well-known/acme-challenge/` | certbot                                          |
| anything else                  | redirected (302) to `APP_FRONTEND_URL`           |

To link WhatsApp, open the GOWA page through a tunnel:
`ssh -L 3001:127.0.0.1:3001 user@server`, then `http://127.0.0.1:3001`.

First checks:

```bash
curl https://<server>/up                 # {"up":true,...}
curl https://<server>/api/config         # realtime settings for the web app
curl https://<server>/api/institutions
```

## 3. Updating

Put the new files on the server (`git pull`, or copy the tree), then:

```bash
cd infra/docker && docker compose up -d --build
```

`backend/.env` is not part of the repository and is never touched by an update.

## 4. Health checks

- `GET /up` returns 200.
- `GET /api/institutions` returns JSON (API and database are up).
- `GET /login` returns 302 to the site.
- `docker compose ps` shows every service `running`.
- `docker compose logs api | grep ERROR` is empty.

## 5. Backups

```bash
docker compose exec -T mariadb sh -c \
  'exec mariadb-dump -ugamfix -p"$MARIADB_PASSWORD" gamfix' > gamfix.sql
docker run --rm -v docker_api_storage:/data -v "$PWD":/backup alpine \
  tar czf /backup/uploads.tgz -C /data .
```

## 6. HTTPS and the certificate

`TLS_HOST` in `backend/.env` names the host the certificate is for
(`51-44-152-213.sslip.io` is a free name that always points at the server).
The `certbot` container issues the certificate on its first start and renews
it every 12 hours when due; the gateway picks up a new certificate within an
hour without a restart. Leave `TLS_HOST` empty to serve HTTP only.

A certificate placed by hand in `infra/docker/tls/` (`fullchain.pem`,
`privkey.pem`) is used until certbot has issued one.

The gateway publishes ports 80 and 443 directly. No iptables or NAT rules are
needed on the host.

## 7. Google sign-in

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, restart
(`docker compose up -d`), and register this redirect URI in Google Cloud
Console: `https://<TLS_HOST>/api/auth/google/callback`. The site addresses the
token is returned to come from `APP_FRONTEND_URL` and `CORS_ORIGINS`.

## 8. Outgoing mail

Verification and password-reset mails need a working transport: set
`MAIL_MAILER=smtp` with `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`,
`MAIL_PASSWORD` (or a provider such as Resend: `MAIL_MAILER=resend`,
`RESEND_KEY`, plus `composer require resend/resend-php`). Do not open
registration publicly before this is configured.
