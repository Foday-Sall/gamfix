# Telegram citizen bot — setup in 5 minutes

The Telegram bot lets **citizens** report problems in a fixed, guided
conversation that mirrors the citizen web app: **category → title →
description → photos (up to 5) → location → confirm**. It is deterministic —
the same steps every time, no AI — and reports land in the exact same queue
as the app, with a tracking number you can check with `/track`.

Built on the [Nutgram](https://nutgram.dev) Laravel package
(`nutgram/nutgram` + `nutgram/laravel`); handlers live in
`backend/routes/telegram.php`, the state machine in
`backend/app/Services/TelegramBotService.php`.

**How linking works (no WhatsApp involved):** the bot asks the citizen to
share their phone with Telegram's own contact button — Telegram only ever
sends the user's own number, so nobody can link someone else's account.

- **Registered number** (verified citizen account) → the chat is linked to
  that account, the bot remembers the citizen's name and greets them with it.
- **Unknown number** → the bot sends the online registration link
  (`/app/signup`), so the same account then works in the web app and the bot.
- **Staff accounts** → refused; the bot is citizens-only. Emergency
  categories are excluded (call the emergency services).

The WhatsApp gateway (GOWA) is **not** part of the bot: it is used for one
thing only — delivering the 6-digit phone-verification codes.

## 1. Create the bot with @BotFather (you do this once)

1. Open Telegram, find **@BotFather**, send `/newbot`.
2. Pick a display name, e.g. `GamFix SL`.
3. Pick a username ending in `bot`, e.g. `GamFixSL_bot`.
4. BotFather replies with a **token** like `7712345678:AAE…`.
   Keep it — nobody else may have it.

## 2. Put the token into the backend

On the VPS, edit `backend/.env` (the only environment file in the project):

```
TELEGRAM_BOT_TOKEN=7712345678:AAE…
```

Then recreate the containers so the new variable reaches them, and register
the webhook:

```
docker compose up -d
docker compose exec api php artisan telegram:webhook
```

## 3. Register the webhook

From `infra/docker/`:

```
docker compose exec api php artisan telegram:webhook
```

The command registers `https://<APP_URL>/api/telegram/webhook` with Telegram
and prints the confirmation. Useful variants:

```
docker compose exec api php artisan telegram:webhook --remove      # turn off
docker compose exec api php artisan telegram:webhook --url=https://…  # override APP_URL

By default queued (pending) updates are kept; only pass `--drop-pending` to
also delete them — that permanently discards citizen messages that Telegram
has not delivered yet.
```

## 4. Test the flow

In Telegram, open your bot and send `/start`:

1. Tap **📱 Share my phone number**.
2. Registered citizen → "Linked to …". Unknown number → you get the
   registration link — sign up online, tap share again.
3. Tap **📄 Report a problem** and follow the 5 steps.
4. You receive a tracking number — check it any time with
   `/track <number>`.

Commands: `/start`, `/help`, `/track ABC123XYZ`, `/cancel`.

## How it works (for maintainers)

| Piece | File |
| --- | --- |
| Handlers (commands, contact, photo, location, callbacks) | `backend/routes/telegram.php` |
| Deterministic state machine + rendering | `backend/app/Services/TelegramBotService.php` |
| Conversation state (chat → citizen, state, answers) | `telegram_conversations` table, `backend/app/Models/TelegramConversation.php` |
| Webhook endpoint (secret-token header, always answers 200) | `backend/app/Http/Controllers/TelegramWebhookController.php` |
| Webhook registration | `php artisan telegram:webhook` — `backend/app/Console/Commands/TelegramSetWebhook.php` |
| Report creation (shared with the app) | `backend/app/Services/ComplaintService.php`, `channel = telegram`, idempotent `external_id = tg:<chat>:<id>` |
| Photo attachment | `getFile` → download → magic-byte check (jpg/png/webp) → size cap → stored like an app upload |
| Tests | `backend/tests/Feature/TelegramBotTest.php` (Nutgram fake bot + faked file downloads) |

Wizard states live in `telegram_conversations.state`:
`idle → report_category → report_title → report_description → report_photos
→ report_location → report_confirm → idle`. A conversation untouched for 6
hours resets automatically; every submit is idempotent, so Telegram's
duplicate deliveries can never create two reports.

Security notes: linking requires Telegram's contact mechanism (own number
only) **and** a verified citizen account; staff/officer accounts are
refused; the webhook rejects every request without the correct
`X-Telegram-Bot-Api-Secret-Token` header; the OTP limits from
`config/gamfix.otp` are untouched for the web app's WhatsApp codes.
