# GamFix API reference

The Laravel 12 JSON API (`backend/`). Every address below is relative to the
API origin — in production `https://51-44-152-213.sslip.io/api` (the web app
on Vercel calls `/api/...` on its own domain and Vercel proxies it here).

- Base URL: `https://51-44-152-213.sslip.io/api` (prefix `api` set in
  `bootstrap/app.php`).
- All answers are JSON. Validation failures return `422` with Laravel's
  standard `{message, errors}` object; other errors use `{message}` or
  `{error}` (401 `{error: "Your session has expired..."}`, 403, 404).
- Liveness (outside `/api`): `GET /up` → `{"up":true,...}`.

## How it works

| Piece | What it is |
| --- | --- |
| Laravel 12 | php-fpm behind the nginx `gateway` container; `routes/api.php` defines everything below. |
| Fortify | The auth **pipeline** (validation, credential check, rate limiting, password hashing) via the actions in `app/Actions/Fortify/`. Its own routes/views are disabled (`Fortify::ignoreRoutes`, `config/fortify.php` paths all `null`); the JSON controllers call the actions. Custom `LoginResponse`/`LogoutResponse` classes return JSON. |
| Sanctum | Bearer tokens. Successful login/register/Google return `{token, user}`; the web app stores both (`gamfix_auth`) and sends `Authorization: Bearer <token>`. Tokens are revoked on logout and when an account is deleted. |
| Socialite | Google sign-in popup flow (`/api/auth/google/redirect?state=...&from=...` → Google → `/api/auth/google/callback` → redirect back to `<from>/auth/google/callback?code=...` with a single-use, 60-second exchange code; the popup redeems it at `POST /api/auth/google/exchange` for the bearer token, so the URL never carries a live credential). `from` is validated against `APP_URL` + `CORS_ORIGINS` (`App\Support\AllowedOrigins`). New Google accounts are citizens, e-mail pre-verified. |
| Reverb | Pusher-protocol websocket server (`wss://.../app/{REVERB_APP_KEY}`). Clients authorize private channels at `POST /api/broadcasting/auth`. Channel definitions live in `routes/channels.php` (staff only — the citizen app intentionally refetches instead). |
| Roles | `role` on the user row (`citizen`, `officer`, `admin`) is **not** trusted by the UI; `POST /api/gamfix/access` is the single source of truth. `admin` = role + exact e-mail in `ADMIN_EMAILS` (also `Gate::before` + the `admin` middleware alias `EnsureAdminAllowlist`). Officers always have `institution_id` and an active `officers` row; there is no officer signup. |
| Rate limits | Login 5 per 5 min per IP+e-mail, registration 3 per 60 s per IP, phone OTP hashed + rate limited per phone (`PhoneOtpService`). |

Middleware aliases (`bootstrap/app.php`): `admin`, `phone.verified`, `bot.secret`.

---

## Auth & session

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | Create a citizen account. Body: `name`, `email`, `password`, `passwordConfirm`. Returns `{token, user}`; e-mail must be verified before the first login. |
| POST | `/auth/login` | — | Custom controller (rate limiting + credential check); body `email`, `password`. 401 until the e-mail is verified. Returns `{token, user}`. |
| POST | `/auth/logout` | bearer | Revokes the current token. |
| GET | `/me` | bearer | The signed-in user (id, e-mail, role, names, phone flags, avatar URL). |

## Google sign-in

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| GET | `/auth/google/redirect?state=&from=` | — | Sends the browser to Google. `from` must be an allowed origin (optionally with `/app` path). |
| GET | `/auth/google/callback` | — | Google lands here; the API redirects the token back to `from`. |

## E-mail & password

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| POST | `/email/request-verification` | — | Sends a signed verification link (e-mail). |
| GET | `/email/verify?...` | signed URL | Marks the address verified, then redirects to the site. |
| POST | `/password/request-reset` | — | Sends the reset link (`ResetPasswordUrl` notification → `<site>/app/reset-password`). |
| POST | `/password/confirm-reset` | — | Body: `token`, `email`, `password`. Sets the new password. |

## Public (no account)

| Method | Path | What it returns |
| --- | --- | --- |
| GET | `/institutions` | Active institutions (id, code, name, logo URL). |
| GET | `/categories` | Complaint categories (slug, name, default institution, sensitive/emergency flags, SLA hours). |
| GET | `/config` | `{realtime: {key, host, port, scheme}}` — where browsers reach Reverb. Public app key only. |
| POST | `/gamfix/track` | Track a report without signing in (reference number lookup). |

## Citizen (bearer)

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/complaints` | The citizen's own reports (paginated feed). |
| GET | `/complaint-updates` | New updates since a cursor (live feed refresh). |
| POST | `/gamfix/complaints` | File a report. Requires `phone.verified`. Body from `StoreComplaintRequest` (category, description, GPS, urgency...). Returns the complaint with its tracking number. |
| POST | `/gamfix/complaints/{complaint}/photos` | Attach photos (`AttachPhotosRequest`, multipart, compressed client-side). |
| POST | `/gamfix/can-confirm` | Whether a resolved report can be confirmed by this citizen. |
| POST | `/gamfix/confirm` | Confirm the fix (closes the report). |
| POST | `/gamfix/reopen` | Reopen a wrongly-resolved report. |
| PATCH | `/users/me` | Update the profile (`ProfileUpdateRequest`: full name, phone...). |
| POST | `/users/avatar` | Upload the avatar. |
| POST | `/gamfix/phone-otp/send` | Send the 6-digit WhatsApp code (GOWA gateway). |
| POST | `/gamfix/phone-otp/verify` | Verify it (`phone_verified = true`). |

## Files (signed URLs, generated by the API)

| Method | Path | What |
| --- | --- | --- |
| GET | `/files/complaints/{complaint}/{photo}` | Complaint photo, `signed` middleware (URLs expire). |
| GET | `/files/users/{user}/{photo}` | Avatar, signed. |
| GET | `/files/institutions/{institution}/{photo}` | Institution logo (public). |

## Staff console (bearer, officer or admin via `POST /gamfix/access`)

All `POST`; parameters use the `p_*` convention. Officers only ever see their
own institution's rows (`StaffScope`); admins see everything.

| Path | Action |
| --- | --- |
| `/gamfix/access` | The role decision: `{ok, role: citizen\|officer\|admin}` (+ `institution` for officers). The web app routes on this answer. |
| `/gamfix/staff/complaints` | Console list (filters: status, categories, map bounds...). |
| `/gamfix/staff/complaint` | One complaint with its full activity trail (`p_complaint_id`). |
| `/gamfix/staff/stats` | Overview/trends numbers (totals, open, resolved 7 days, overdue SLA, avg resolution, by status/category/channel/urgency, daily series). |
| `/gamfix/staff/accept` | Accept a submitted report. |
| `/gamfix/staff/status` | Move the status (`StatusMachine` guards the legal moves). |
| `/gamfix/staff/resolution` | Mark fixed with a citizen-visible message (+ proof photo URL). |
| `/gamfix/staff/reject` | Reject with a reason. |
| `/gamfix/staff/request-info` | Ask the citizen for more information. |
| `/gamfix/staff/forward` | Forward to another institution (`p_institution_id`, `p_reason`). |
| `/gamfix/staff/proof` | Attach resolution proof (`p_photo_url`). |
| `/gamfix/staff/map` | Complaints inside map bounds for the map page. |

Every status change fires `App\Events\ComplaintActivity` (ShouldBroadcast) on
`private-admins` and the owning institution's `private-institution.{id}` —
that is what makes the consoles update live.

## Admin (bearer + `admin` middleware)

| Path | Actions (body `{action, params}`) |
| --- | --- |
| `/gamfix/admin` | `getOverviewStats`, `getInstitutions`, `createInstitution`, `getOfficers`, `createOfficer` (returns a temporary password), `toggleOfficerActive`, `getAccessLimits`, `setAccessLevel`, `setAllowedCategories`, `setSlaHours`, `setRateLimit`, `getAuditLog`, `getSettings`, `saveSettings`. |
| `/gamfix/admin-secrets` | `list`, `get_status`, `set`, `delete`, `get_audit` — manage which env-managed secrets exist without exposing values. |
| `/gamfix/admin-whatsapp` | `list_numbers`, `start_link`, `confirm_link`, `set_role`, `revoke`, `delete_number`, `get_sender` — link/remove WhatsApp devices through GOWA. |

## Machine endpoints

| Method | Path | Auth | What |
| --- | --- | --- | --- |
| POST | `/gamfix/wa-bot/submit` | `X-WA-Bot-Secret` header (`WA_BOT_SECRET`) | The WhatsApp bot files a report on behalf of a citizen. |
| POST | `/broadcasting/auth` | bearer | Pusher-protocol private-channel authorization (Reverb). |

## Realtime channels (`routes/channels.php`)

| Channel | Who may join |
| --- | --- |
| `private-institution.{id}` | Officers of that institution, platform admins. |
| `private-admins` | Platform admins only. |

Citizens deliberately have no channel — their screens refetch after each
action, so nothing realtime needs authorizing for them.
