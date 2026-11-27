<?php

namespace App\Actions\Fortify;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Laravel\Fortify\Contracts\CreatesNewUsers;

class CreateNewUser implements CreatesNewUsers
{
    /**
     * Validate and create a new account. Citizens start unverified with the
     * usual steps; an allowlisted admin e-mail (see gamfix.admin_emails) is
     * created as a pre-verified admin. Fortify actions are the single home
     * for auth behavior now (controllers delegate to them).
     */
    public function create(array $input): User
    {
        $input['email'] = strtolower(trim((string) ($input['email'] ?? '')));
        if (isset($input['passwordConfirm'])) {
            // The SPA sends passwordConfirm; Fortify's rule expects `confirmed`.
            $input['password_confirmation'] = $input['passwordConfirm'];
        }

        Validator::make($input, [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190', Rule::unique('users', 'email')],
            'password' => ['required', 'string', Password::min(6), 'confirmed'],
        ])->validate();

        // The admin allowlist owns the platform: signing up with one of
        // those e-mails creates the account as a pre-verified admin, so the
        // owner goes straight to the console like every other login method.
        $isAdmin = User::isAdminEmail($input['email']);

        return User::create([
            'name' => $input['name'],
            'email' => $input['email'],
            'password' => Hash::make($input['password']),
            'full_name' => null,
            'role' => $isAdmin ? 'admin' : 'citizen',
            'email_verified_at' => $isAdmin ? now() : null,
            'phone_verified' => false,
        ]);
    }
}
