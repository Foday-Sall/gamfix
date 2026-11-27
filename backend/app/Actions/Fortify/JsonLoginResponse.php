<?php

namespace App\Actions\Fortify;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Laravel\Fortify\Contracts\LoginResponse;

/**
 * JSON token response issued after a successful Fortify login attempt —
 * the API is SPA-only (no views), so the response carries a Sanctum token
 * plus the user DTO the React frontends expect.
 */
class JsonLoginResponse implements LoginResponse
{
    public function toResponse($request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'token' => $user->createToken('auth')->plainTextToken,
            'user' => $user->dto(),
        ]);
    }
}
