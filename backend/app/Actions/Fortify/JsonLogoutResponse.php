<?php

namespace App\Actions\Fortify;

use Illuminate\Http\JsonResponse;
use Laravel\Fortify\Contracts\LogoutResponse;

class JsonLogoutResponse implements LogoutResponse
{
    public function toResponse($request): JsonResponse
    {
        return response()->json(['ok' => true]);
    }
}
