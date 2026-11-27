<div align="center">

# 🇬🇲 GamFix SL

**Civic-tech platform for The Gambia: citizens report infrastructure problems (garbage, broken lights, damaged roads…) with photos and GPS, and staff of institutions process the reports until they are fixed.**

[![Laravel](https://img.shields.io/badge/Laravel_12-FF2D20?style=flat-square&logo=laravel&logoColor=white)](https://laravel.com)
[![PHP](https://img.shields.io/badge/PHP_8.2+-777BB4?style=flat-square&logo=php&logoColor=white)](https://php.net)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript_6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![MariaDB](https://img.shields.io/badge/MariaDB-003545?style=flat-square&logo=mariadb&logoColor=white)](https://mariadb.org)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![Telegram Bot](https://img.shields.io/badge/Telegram_Bot_(Nutgram)-26A5E4?style=flat-square&logo=telegram&logoColor=white)](docs/TELEGRAM-BOT.md)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)](docs/VERCEL.md)

</div>

---

## ✨ What citizens and staff can do

| Citizens | Institutions |
| --- | --- |
| 📄 Report problems with photos + GPS (web app or Telegram bot) | 🗂 Accept, reject, forward or request info on reports |
| 🔎 Track any report with its tracking number | 📊 Dashboard with live stats, trends and a map view |
| 🔔 Follow the whole timeline: submitted → in progress → resolved | 🔁 Set resolution status with proof photos for the citizen |
| ✅ Confirm the fix (or reopen) | 🔐 Role-based access: officers see only their institution |
| 📱 Telegram bot walks through it step by step — no app install needed | 🧾 Every channel feeds the same queue: web app + Telegram |

## 🧱 The tech stack

| Layer | Technology | Why |
| --- | --- | --- |
| API | **Laravel 12** · Fortify · Sanctum · Socialite | JSON API, token auth, Google sign-in |
| Realtime | **Laravel Reverb** (websockets) | Live status updates in the dashboards |
| Database | **MariaDB** | Complaints, users, institutions, categories |
| Frontend | **React 19 + TypeScript + Vite + Tailwind 4** | Landing page + one web app for citizens and staff |
| Messaging | **Telegram Bot API** ([Nutgram](https://nutgram.dev)) + **WhatsApp (GOWA) for codes only** | Citizens report through the bot, guided step by step; the WhatsApp gateway delivers only the 6-digit verification codes |
| Backend host | **Docker Compose** on a VPS | gateway (nginx) + api (php-fpm) + reverb + mariadb + gowa + certbot |
| Frontend host | **Vercel** | Static SPA + API proxy, deploys on every push |
| Security | Full security headers, strict CSP, signed expiring file URLs, rate limits | See the security audit in the release notes |

## 🗂 Repository layout

- **`backend/`** — the Laravel 12 JSON API: Sanctum tokens, Socialite (Google
  sign-in), Laravel Reverb (websocket realtime), MariaDB. Runs on the VPS.
  `backend/.env` is the only environment file in the project.
- **`frontend/`** — the site, deployed on Vercel:
  - **`landing/`** — static marketing page, served at `/`
  - **`web/`** — the one web app for everybody who signs in, served at `/app`:
    citizen screens and the staff console, one login page. The account
    decides which side opens.
- **`infra/docker/`** — one-command backend stack: gateway + api + reverb +
  mariadb + gowa + certbot
- **`docs/`** — ARCHITECTURE.md, DEPLOY.md, VERCEL.md, API.md,
  TELEGRAM-BOT.md

## 🚀 How to run it

### Backend on a server (Docker)

```bash
cp backend/.env.example backend/.env   # fill in every CHANGE ME
cd infra/docker && docker compose up -d --build
```

Then (first run): `docker compose exec api php artisan migrate --force` and
`docker compose exec api php artisan db:seed --force`. TLS certificates are
issued and renewed automatically by the bundled certbot service
(`docs/DEPLOY.md` has the full VPS runbook).

### Frontend on Vercel (one click)

Import this repository on Vercel — **one project, repository root, no
settings, no environment variables**. Vercel runs `npm run build`
(`scripts/build-site.mjs`) and takes `vercel.json` for everything else
(routes, API proxy to the VPS, security headers). Every push to `main`
deploys again → `docs/VERCEL.md`.

### Local development

```bash
# Backend (PHP 8.2+, Composer, MariaDB running locally or via Docker)
cd backend
cp .env.example .env && composer install && php artisan key:generate
php artisan migrate --seed && php artisan serve          # http://127.0.0.1:8000

# Frontend (Node 22+)
cd frontend/web
npm install && npm run dev                               # web app
cd ../landing && npm install && npm run dev              # landing page
```

Tests: `cd backend && php artisan test` (in-memory SQLite, no secrets
needed). The suite covers the public API contract, auth, the complaint
lifecycle and the Telegram bot's full guided flow.

### 🤖 Telegram bot (citizens report by chat)

1. Create a bot with **@BotFather** in Telegram (2 minutes — it gives you a
   token) and put the token into `backend/.env`.
2. Run `docker compose exec api php artisan telegram:webhook`.

Full step-by-step guide: **[docs/TELEGRAM-BOT.md](docs/TELEGRAM-BOT.md)**.
The bot is deterministic — a fixed guided conversation, only for citizens:
share your phone (Telegram's contact button) to link your account, unknown
numbers get the online registration link, and then it's the same steps as
the web app — category → title → description → photos → location → confirm
— ending in a tracking number. It remembers your name between chats.

## 📚 More docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces talk to each other
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — the VPS runbook, end to end
- [`docs/VERCEL.md`](docs/VERCEL.md) — the site deployment
- [`docs/API.md`](docs/API.md) — the full JSON API reference
- [`docs/TELEGRAM-BOT.md`](docs/TELEGRAM-BOT.md) — the citizen bot setup
