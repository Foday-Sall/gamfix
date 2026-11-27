<?php

namespace App\Actions\Fortify;

use App\Models\User;
use Illuminate\Support\Facades\Validator;
use Laravel\Fortify\Contracts\UpdatesUserProfileInformation;

class UpdateUserProfileInformation implements UpdatesUserProfileInformation
{
    /**
     * Full-name updates through the Fortify pipeline (the /api/users/me
     * controller delegates here; avatar uploads keep their own endpoint).
     */
    public function update(User $user, array $input): void
    {
        Validator::make($input, [
            'full_name' => ['nullable', 'string', 'max:255'],
            'name' => ['nullable', 'string', 'max:255'],
        ])->validate();

        if (isset($input['name'])) {
            $user->name = $input['name'];
        }
        if (array_key_exists('full_name', $input)) {
            $user->full_name = $input['full_name'] !== null ? trim((string) $input['full_name']) : null;
        }

        $user->save();
    }
}
