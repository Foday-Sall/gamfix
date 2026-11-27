<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePhoneVerified
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && ! $user->phone_verified) {
            return response()->json(
                ['error' => 'Verify your phone number on WhatsApp first.'],
                403,
            );
        }

        return $next($request);
    }
}
