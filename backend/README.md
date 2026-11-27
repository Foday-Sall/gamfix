# GamFix API (Laravel 12)

JSON REST API for the GamFix platform. Sanctum personal tokens, Socialite
Google sign-in, Laravel Reverb websocket broadcasts, MariaDB.

## Layout

```
app/
├── Http/Controllers/
│   ├── Auth/              login/register, Google, verification, reset
│   ├── Citizen*.php       report intake, tracking, confirm/reopen, profile
│   ├── Staff*.php         officer console actions, stats, map
│   ├── Admin*.php         admin allowlist, settings, WhatsApp console
│   ├── PhoneOtpController / PublicDataController / FilesController
│   └── WaBotController    machine-to-machine report submit (shared secret)
├── Http/Middleware/       EnsureAdminAllowlist, EnsurePhoneVerified,
│                          EnsureWaBotSecret
├── Models/                User, Complaint, Institution, Category, ...
├── Events/                ComplaintActivity (Reverb private broadcasts)
├── Mail/                  VerifyEmailMail, PasswordResetMail
├── Observers/             ComplaintObserver (dispatches ComplaintActivity)
├── Services/              PhoneOtpService (GOWA), GowaService, AuditLogger,
│                          ComplaintService
routes/api.php             all endpoints
routes/channels.php        private channel authorization rules
```

## Run

```bash
composer install
cp .env.example .env       # set APP_KEY, DB_*, GOWA_*, ADMIN_EMAILS...
php artisan migrate --seed
php artisan serve          # or php-fpm behind the web container
php artisan reverb:start   # websocket server
```

See `docs/DEPLOY.md` for the full Docker bring-up and the environment
matrix (Google OAuth, GOWA device, SMTP mail, admin allowlist).
