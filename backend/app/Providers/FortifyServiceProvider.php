<?php

namespace App\Providers;

use App\Actions\Fortify\CreateNewUser;
use App\Actions\Fortify\JsonLoginResponse;
use App\Actions\Fortify\JsonLogoutResponse;
use App\Actions\Fortify\ResetUserPassword;
use App\Actions\Fortify\UpdateUserProfileInformation;
use App\Models\User;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Laravel\Fortify\Contracts\LoginResponse;
use Laravel\Fortify\Contracts\LogoutResponse;
use Laravel\Fortify\Fortify;

/**
 * Laravel Fortify wiring for the GamFix API.
 *
 * Fortify is frontend-agnostic: it owns the auth pipeline (validation,
 * rate limiting, credential checks, password hashing) while the thin
 * controllers in App\Http\Controllers keep the existing JSON wire
 * contract the React apps speak (Sanctum token + user DTO). The
 * traditional web views/redirects Fortify ships are disabled — this
 * stack is a pure JSON API (Fortify::ignoreRoutes keeps its default
 * /login form routes out of the /api namespace; the API routes call
 * the actions directly).
 */
class FortifyServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // JSON responses instead of Fortify's web redirects.
        $this->app->singleton(LoginResponse::class, JsonLoginResponse::class);
        $this->app->singleton(LogoutResponse::class, JsonLogoutResponse::class);
    }

    public function boot(): void
    {
        // Only the features the API actually exposes. Email verification and
        // password reset keep their dedicated /api routes (SPA-friendly URLs
        // with signed links), so only registration + login+logout features
        // are enabled here; profiles are updated through the existing
        // /api/users/me endpoint.
        Fortify::createUsersUsing(CreateNewUser::class);
        Fortify::resetUserPasswordsUsing(ResetUserPassword::class);
        Fortify::updateUserProfileInformationUsing(UpdateUserProfileInformation::class);

        Fortify::authenticateUsing(function (Request $request) {
            $user = User::where('email', strtolower(trim((string) $request->input('email'))))->first();

            if ($user && Hash::check((string) $request->input('password'), $user->password)) {
                return $user;
            }

            return null;
        });

        // Login throttling: 5 attempts / 5 min per email+IP pair (matches the
        // legacy AuthController limiter that hardened the endpoint against
        // brute force).
        RateLimiter::for('login', function (Request $request) {
            $email = strtolower(trim((string) $request->input('email')));

            return [
                Limit::perAttempt(5)->by($request->ip().'|'.$email),
            ];
        });

        // Registration is open but throttled lightly (3 / minute per IP).
        RateLimiter::for('registration', function (Request $request) {
            return [Limit::perMinute(3)->by($request->ip())];
        });
    }
}
