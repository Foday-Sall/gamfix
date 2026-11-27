<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Institution;
use Illuminate\Http\JsonResponse;

class PublicDataController extends Controller
{
    public function institutions(): JsonResponse
    {
        $rows = Institution::where('active', true)
            ->orderBy('code')
            ->get()
            ->map(fn (Institution $i) => $i->publicDto());

        return response()->json(['institutions' => $rows]);
    }

    public function categories(): JsonResponse
    {
        $rows = Category::where('active', true)
            ->orderBy('slug')
            ->get()
            ->map(fn (Category $c) => [
                'id' => $c->id,
                'slug' => $c->slug,
                'name' => $c->name,
                'default_institution_id' => $c->default_institution_id,
                'is_sensitive' => (bool) $c->is_sensitive,
                'is_emergency' => (bool) $c->is_emergency,
                'deadline_hours' => (int) $c->deadline_hours,
            ]);

        return response()->json(['categories' => $rows]);
    }

    public function clientConfig(): JsonResponse
    {
        $reverb = (array) config('broadcasting.connections.reverb');
        $options = (array) ($reverb['options'] ?? []);
        $public = (array) config('gamfix.realtime');
        $port = $public['public_port'] ?: ($options['port'] ?? null);
        $scheme = $public['public_scheme'] ?: ($options['scheme'] ?? null);

        return response()->json([
            'realtime' => [
                'key' => (string) ($reverb['key'] ?? ''),
                'host' => (string) ($public['public_host'] ?: ($options['host'] ?? '')),
                'port' => is_numeric($port) ? (int) $port : null,
                'scheme' => in_array($scheme, ['https', 'wss'], true) ? 'wss' : 'ws',
            ],
            'telegram_bot_username' => (string) config('gamfix.telegram_bot_username'),
        ])->header('Cache-Control', 'public, max-age=300');
    }
}
