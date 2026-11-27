<?php

namespace App\Http\Controllers;

use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Fortify\Contracts\CreatesNewUsers;
use Laravel\Fortify\Contracts\LoginResponse;

/**
 * Thin JSON controllers on top of the Laravel Fortify auth pipeline:
 * validation, rate limiting and credential checks live in the Fortify
 * actions/limiter (see App\Providers\FortifyServiceProvider); these
 * methods adapt them to the SPA wire contract (Sanctum token + user
 * DTO) the React frontends consume.
 */
class AuthController extends Controller
{
    public function __construct(
        private CreatesNewUsers $createUser,
        private LoginResponse $loginResponse,
    ) {}

    public function register(RegisterRequest $request): JsonResponse
    {
        // Light per-IP throttle (matches Fortify's `registration` limiter).
        $key = 'register:'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 3)) {
            return response()->json(['error' => 'Too many sign-up attempts. Please wait a minute.'], 429);
        }
        RateLimiter::hit($key, 60);

        // The action re-validates (Fortify contract) and sets the defaults;
        // the request-level rules already guaranteed the shape. Allowlisted
        // admin e-mails are created pre-verified and skip the mail loop.
        $user = $this->createUser->create($request->validated());

        if (! $user->hasVerifiedEmail()) {
            $user->sendEmailVerificationNotification();
        }

        return response()->json([
            'token' => $user->createToken('auth')->plainTextToken,
            'user' => $user->dto(),
        ]);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $data = $request->validated();

        $email = strtolower(trim($data['email']));
        $key = 'login:'.$request->ip().':'.$email;
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json(['error' => 'Too many login attempts. Please wait a few minutes.'], 429);
        }

        $user = User::where('email', $email)->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($key, 300);

            return response()->json(['error' => 'Invalid login credentials.'], 401);
        }
        RateLimiter::clear($key);

        // The allowlist outranks the stored role: signing in with an
        // allowlisted e-mail re-asserts admin forever, before the
        // verification guard, so the owner is never locked out.
        $user->promoteIfAdminEmail();

        if (! $user->hasVerifiedEmail()) {
            return response()->json(['error' => 'Please verify your email address first.'], 401);
        }

        // Fortify JSON login response (Sanctum token + user DTO).
        $request->setUserResolver(function () use ($user) {
            return $user;
        });

        return $this->loginResponse->toResponse($request);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user()->dto());
    }

    public function registerPrefill(Request $request): RedirectResponse
    {
        $phone = (string) $request->query('phone', '');
        $frontend = rtrim((string) config('gamfix.frontend_url'), '/');

        return redirect()->away($frontend.'/app/signup?'.http_build_query(['phone' => $phone]));
    }
}
