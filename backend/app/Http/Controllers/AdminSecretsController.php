<?php

namespace App\Http\Controllers;

use App\Models\AdminAuditLog;
use App\Models\AppSecret;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AdminSecretsController extends Controller
{
    public function action(Request $request): JsonResponse
    {
        $action = (string) $request->input('action', '');
        $params = (array) $request->input('params', []);
        $actor = strtolower((string) $request->user()->email);
        $p = fn (string $key) => $params[$key] ?? null;

        switch ($action) {
            case 'list':
                $keys = AppSecret::query()->pluck('key')->all();

                return response()->json(['ok' => true, 'data' => ['keys' => $keys]]);

            case 'get_status':
                $key = (string) $p('p_key');
                $secret = AppSecret::find($key);

                return response()->json(['ok' => true, 'data' => [
                    'key' => $key,
                    'exists' => $secret !== null,
                    'length' => $secret?->value !== null ? strlen((string) $secret->value) : 0,
                ]]);

            case 'set':
                $key = (string) $p('p_key');
                $value = (string) $p('p_value');
                if ($key === '' || Str::length($key) > 80) {
                    return response()->json(['ok' => false, 'error' => 'invalid_key']);
                }
                if (AppSecret::isReserved($key)) {
                    return response()->json(['ok' => false, 'error' => 'reserved_key']);
                }
                AppSecret::updateOrCreate(['key' => $key], ['value' => $value]);
                AuditLogger::log($actor, 'secret_set', 'app_secret', $key, []);

                return response()->json(['ok' => true]);

            case 'delete':
                $key = (string) $p('p_key');
                $secret = AppSecret::find($key);
                if (! $secret) {
                    return response()->json(['ok' => false, 'error' => 'not_found']);
                }
                $secret->delete();
                AuditLogger::log($actor, 'secret_delete', 'app_secret', $key, []);

                return response()->json(['ok' => true]);

            case 'get_audit':
                $limit = min(max((int) ($p('p_limit') ?: 100), 1), 500);
                $rows = AdminAuditLog::where('target_type', 'app_secret')
                    ->orderByDesc('created_at')->limit($limit)->get()
                    ->map(fn (AdminAuditLog $row) => [
                        'actor_email' => $row->actor_email,
                        'action' => $row->action,
                        'target_id' => $row->target_id,
                        'created' => $row->created_at?->toISOString(),
                    ])->all();

                return response()->json(['ok' => true, 'data' => $rows]);

            default:
                return response()->json(['ok' => false, 'error' => 'unknown_action']);
        }
    }
}
