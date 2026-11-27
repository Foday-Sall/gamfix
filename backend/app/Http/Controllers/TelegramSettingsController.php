<?php

namespace App\Http\Controllers;

use App\Services\TelegramLinkService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TelegramSettingsController extends Controller
{
    public function __construct(private TelegramLinkService $links) {}

    public function create(Request $request): JsonResponse
    {
        $issued = $this->links->issue($request->user());
        if ($issued === null) {
            return response()->json(['error' => 'The Telegram bot is not configured yet.'], 503);
        }

        return response()->json(['ok' => true, 'url' => $issued['url'], 'expires_in' => $issued['expires_in']]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $request->user()->unlinkTelegram();

        return response()->json(['ok' => true]);
    }
}
