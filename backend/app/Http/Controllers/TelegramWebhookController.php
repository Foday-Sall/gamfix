<?php

namespace App\Http\Controllers;

use App\Models\TelegramUpdate;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use SergiX44\Nutgram\Nutgram;
use Throwable;

/**
 * Receives Telegram webhook updates for the citizen bot. Telegram
 * authenticates itself with the X-Telegram-Bot-Api-Secret-Token header
 * (we register the webhook with secret_token = md5(APP_KEY)); everything
 * else gets a 403. Each update is claimed in telegram_updates (unique
 * update_id) before processing: duplicates are acknowledged without
 * reprocessing, and a processing failure releases the claim and returns
 * 500 so Telegram retries.
 */
class TelegramWebhookController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $key = (string) config('app.key');
        $given = (string) $request->header('X-Telegram-Bot-Api-Secret-Token', '');
        if ($key === '' || ! hash_equals(md5($key), $given)) {
            return response()->json(['error' => 'forbidden'], 403);
        }

        if (empty((string) config('nutgram.token'))) {
            return response()->json(['ok' => true, 'bot' => 'not-configured']);
        }

        if ($request->getContent() === '') {
            return response()->json(['ok' => true]);
        }

        $claimed = null;
        $updateId = $request->json('update_id');
        if (is_numeric($updateId)) {
            // Housekeeping once a minute instead of a DELETE per update: the
            // webhook is the hottest endpoint and every query on it counts.
            if (Cache::add('gamfix:tg-prune-lock', true, 60)) {
                TelegramUpdate::where('created_at', '<', now()->subDays(2))->delete();
            }
            try {
                $claimed = TelegramUpdate::create(['update_id' => (int) $updateId]);
            } catch (UniqueConstraintViolationException) {
                return response()->json(['ok' => true]);
            }
        }

        try {
            app(Nutgram::class)->run();
        } catch (Throwable $e) {
            report($e);
            if ($claimed === null) {
                return response()->json(['ok' => true]);
            }

            $claimed->delete();

            return response()->json(['error' => 'processing_failed'], 500);
        }

        return response()->json(['ok' => true]);
    }
}
