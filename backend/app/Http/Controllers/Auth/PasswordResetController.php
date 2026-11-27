<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Laravel\Fortify\Contracts\ResetsUserPasswords;

class PasswordResetController extends Controller
{
    public function __construct(
        private ResetsUserPasswords $resetPassword,
    ) {}

    public function request(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);

        Password::broker()->sendResetLink(['email' => strtolower(trim($data['email']))]);

        return response()->json(['ok' => true]);
    }

    public function confirm(Request $request): JsonResponse
    {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', PasswordRule::min(6)],
            'passwordConfirm' => ['required', 'string', 'same:password'],
        ]);

        $status = Password::broker()->reset(
            ['email' => strtolower($data['email']), 'password' => $data['password'], 'token' => $data['token']],
            function (User $user, string $password): void {
                // Fortify password-reset pipeline (hashes + persists).
                $this->resetPassword->reset($user, ['password' => $password]);
            },
        );

        if ($status !== Password::PASSWORD_RESET) {
            return response()->json(['error' => __($status)], 400);
        }

        return response()->json(['ok' => true]);
    }
}
