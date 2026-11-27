<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class EmailVerificationController extends Controller
{
    public function request(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);
        $email = strtolower(trim($data['email']));

        $allowed = RateLimiter::attempt('verify-email:'.$email, 3, fn () => null, 300);
        if (! $allowed) {
            return response()->json(['error' => 'Too many requests. Please wait a few minutes.'], 429);
        }

        $user = User::where('email', $email)->first();
        if ($user && ! $user->hasVerifiedEmail()) {
            $user->sendEmailVerificationNotification();
        }

        return response()->json(['ok' => true]);
    }

    public function verify(Request $request): RedirectResponse
    {
        $user = User::find((string) $request->input('user', ''));

        if ($user && ! $user->hasVerifiedEmail()) {
            $user->forceFill(['email_verified_at' => now()])->save();
        }

        $frontend = rtrim((string) config('gamfix.frontend_url'), '/');

        return redirect()->away($frontend.'/verify/email?verified=1');
    }
}
