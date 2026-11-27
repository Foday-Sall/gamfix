<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdminAllowlist
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $user->isAllowlistedAdmin()) {
            return response()->json(['error' => 'invalid_token'], 401);
        }

        return $next($request);
    }
}
