<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        Gate::before(function ($user) {
            if ($user && $user->isAllowlistedAdmin()) {
                return true;
            }

            return null;
        });

        RateLimiter::for('otp-send', function (Request $request) {
            return [
                Limit::perMinute(4)->by(
                    'otp:'.($request->user()?->id ?? 'guest').':'.$request->ip(),
                ),
            ];
        });
    }
}
