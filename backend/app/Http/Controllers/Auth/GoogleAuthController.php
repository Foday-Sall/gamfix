<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\AllowedOrigins;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Laravel\Socialite\Facades\Socialite;

// Google OAuth via Socialite (stateless popup flow, multi-frontend aware).
// The web app opens GET /api/auth/google/redirect?state=<uuid>&from=<frontend>;
// `from` is the address the web app is opened at, validated against the
// allowed origins (APP_URL + CORS_ORIGINS) so the callback can send the
// session token back to whichever deployment started the flow. New accounts
// are created pre-verified with `name` prefilled from the Google profile and
// full_name left empty so first-time users pass through the name-confirmation
// step.
class GoogleAuthController extends Controller
{
    public function redirect(Request $request)
    {
        if (! config('services.google.client_id') || ! config('services.google.client_secret')) {
            return $this->failRedirect('Google sign-in is not configured on the server.', '', $request);
        }

        $state = (string) $request->query('state', '');
        if ($state === '' || strlen($state) > 128) {
            return $this->failRedirect('Invalid sign-in state. Please close this window and try again.', '', $request);
        }

        return Socialite::driver('google')
            ->redirectUrl($this->redirectUri())
            ->with(['state' => $this->packState($state, $this->origin($request))])
            ->redirect();
    }

    public function callback(Request $request)
    {
        if (! config('services.google.client_id') || ! config('services.google.client_secret')) {
            return $this->failRedirect('Google sign-in is not configured.', '', $request);
        }

        [$state, $origin] = $this->unpackState((string) $request->query('state', ''));
        try {
            $social = Socialite::driver('google')->stateless()->redirectUrl($this->redirectUri())->user();
        } catch (\Throwable $e) {
            report($e);

            return $this->failRedirect('Google sign-in failed. Please close this window and try again.', $state, $request, $origin);
        }

        $email = strtolower(trim((string) $social->getEmail()));
        if ($email === '') {
            return $this->failRedirect('Your Google account did not share an email address.', $state, $request, $origin);
        }

        $user = User::where('google_id', (string) $social->getId())
            ->orWhere('email', $email)
            ->first();
        $isNew = false;

        if (! $user) {
            $user = new User(['email' => $email, 'password' => bin2hex(random_bytes(24))]);
            $user->name = mb_substr(trim((string) $social->getName()), 0, 120) ?: null;
            $user->full_name = null;
            $user->role = User::isAdminEmail($email) ? 'admin' : 'citizen';
            $user->email_verified_at = now();
            $user->phone_verified = false;
            $user->google_id = (string) $social->getId();
            $user->save();
            $isNew = true;
        } elseif ($user->google_id !== (string) $social->getId()) {
            $user->google_id = (string) $social->getId();
            $user->save();
        }

        if (! $user->name && $social->getName()) {
            $user->name = mb_substr(trim((string) $social->getName()), 0, 120);
            $user->save();
        }

        // The allowlist outranks the stored role: Google sign-in with an
        // allowlisted e-mail re-asserts admin forever.
        $user->promoteIfAdminEmail();

        $frontend = $origin ?: $this->frontendUrl($request);

        return redirect()->away(
            $frontend.'/auth/google/callback?code='.urlencode(static::issueExchangeCode($user->id))
            .'&new='.($isNew ? '1' : '0')
            .'&state='.urlencode($state),
        );
    }

    /**
     * Single-use, 60-second exchange code: the callback URL carries this
     * opaque code instead of a live bearer token, and the popup redeems it
     * at POST /api/auth/google/exchange. Only the hash is stored in the
     * cache, so the URL never contains a reusable credential.
     */
    public static function issueExchangeCode(string $userId): string
    {
        $code = bin2hex(random_bytes(24));
        Cache::put('gamfix:oauth-code:'.hash('sha256', $code), $userId, now()->addSeconds(60));

        return $code;
    }

    public function exchange(Request $request): JsonResponse
    {
        $code = (string) $request->input('code', '');
        if ($code === '' || strlen($code) > 128) {
            return response()->json(['error' => 'Invalid sign-in code. Please try signing in again.'], 400);
        }

        $userId = Cache::pull('gamfix:oauth-code:'.hash('sha256', $code));
        $user = $userId ? User::find($userId) : null;
        if (! $user) {
            return response()->json(['error' => 'The sign-in code expired or was already used. Please sign in again.'], 400);
        }

        return response()->json(['token' => $user->createToken('google')->plainTextToken]);
    }

    /** OAuth state passed through Google: "<uuid>|<frontend origin>". */
    private function packState(string $state, string $origin): string
    {
        return $state.'|'.$origin;
    }

    /** Inverse of packState; unknown origins fall back to the configured frontend. */
    private function unpackState(string $raw): array
    {
        $parts = explode('|', $raw, 2);
        $state = (string) ($parts[0] ?? '');
        $origin = isset($parts[1]) ? $this->allowedOrigin($parts[1]) : null;

        return [$state, $origin];
    }

    /** The validated caller origin (Referer/`from` param) or null. */
    private function origin(Request $request): string
    {
        $from = (string) $request->query('from', '');
        if ($from !== '') {
            $allowed = $this->allowedOrigin($from);
            if ($allowed !== null) {
                return $allowed;
            }
        }

        return '';
    }

    /** Frontend base: `from` origin when allowed, else gamfix.frontend_url. */
    private function frontendUrl(Request $request): string
    {
        $from = $this->origin($request);

        return $from !== '' ? $from : rtrim((string) config('gamfix.frontend_url'), '/');
    }

    /**
     * The frontend address a token may be sent back to: the allowed origin,
     * followed by /app when the web app is served under it (Vercel). Any
     * other path, and any origin that is not on the list, is refused.
     */
    private function allowedOrigin(string $candidate): ?string
    {
        $parts = parse_url(strtolower(trim($candidate)));

        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            return null;
        }

        if (! in_array($parts['scheme'], ['http', 'https'], true)) {
            return null;
        }

        $origin = $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');

        if (! AllowedOrigins::isAllowed($origin)) {
            return null;
        }

        return rtrim($parts['path'] ?? '', '/') === '/app' ? $origin.'/app' : $origin;
    }

    /** Redirect URI registered with Google: APP_URL + /api/auth/google/callback. */
    private function redirectUri(): string
    {
        return rtrim((string) config('app.url'), '/').'/api/auth/google/callback';
    }

    /** Error path: send the popup to the frontend with an error query. */
    private function failRedirect(string $message, string $state = '', ?Request $request = null, ?string $origin = null): RedirectResponse
    {
        $frontend = $origin
            ?? ($request ? $this->frontendUrl($request) : rtrim((string) config('gamfix.frontend_url'), '/'));
        $query = http_build_query(['error' => $message, 'state' => $state]);

        return redirect()->away($frontend.'/auth/google/callback?'.$query);
    }
}
