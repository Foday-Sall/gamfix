<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

// Institution-only realtime authorization: staff channels for the dashboards.
// Citizens intentionally have no websocket channel — the citizen app is
// request/response and refetches on navigation and after each action.

Broadcast::channel('institution.{id}', function (User $user, string $id) {
    if ($user->isAllowlistedAdmin()) {
        return true;
    }

    return $user->role === 'officer'
        && (string) $user->institution_id === $id
        && $user->activeOfficer() !== null;
});

Broadcast::channel('admins', function (User $user) {
    return $user->isAllowlistedAdmin();
});
