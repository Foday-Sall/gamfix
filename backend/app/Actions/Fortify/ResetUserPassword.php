<?php

namespace App\Actions\Fortify;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Laravel\Fortify\Contracts\ResetsUserPasswords;

class ResetUserPassword implements ResetsUserPasswords
{
    /**
     * Reset the user's password via the Fortify pipeline (called by the
     * /api/password/confirm-reset controller; token validation still runs
     * through the Password broker).
     */
    public function reset(User $user, array $input): void
    {
        $user->forceFill([
            'password' => Hash::make($input['password']),
        ])->save();
        $user->tokens()->delete();
    }
}
