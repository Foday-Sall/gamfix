<?php

return [
    // The platform owner. Exact e-mails on this list are admin forever:
    // signing up, logging in or using Google with one of them always lands
    // on the admin console, whatever the stored role says.
    'admin_emails' => array_values(array_filter(array_map(
        trim(...),
        explode(',', (string) env('ADMIN_EMAILS', 'salldevvv@gmail.com')),
    ))),

    'tracking_alphabet' => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
    'tracking_length' => 9,

    'telegram_bot_username' => env('TELEGRAM_BOT_USERNAME'),

    'gowa' => [
        'base_url' => env('GOWA_BASE_URL', 'http://127.0.0.1:3000'),
        'basic_auth' => env('GOWA_BASIC_AUTH')
            ?: (env('GOWA_PASS') ? env('GOWA_USER', 'gowa').':'.env('GOWA_PASS') : null),
        'device_id' => env('GOWA_DEVICE_ID', 'wa-2205111924'),
    ],

    'staff_bootstrap_token' => env('STAFF_BOOTSTRAP_TOKEN'),

    'otp' => [
        'ttl_seconds' => 600,
        'resend_window_seconds' => 60,
        'max_attempts' => 5,
        'max_per_ip' => 10,
    ],

    // Dashboard aggregates are expensive scans; under load every concurrent
    // stats request re-runs them on a small CPU budget (fpm slowlog showed
    // requests queued behind each other inside PDO::execute). A short cache
    // keeps dashboards responsive at any VU count. 0 disables caching (tests).
    'stats' => [
        'cache_ttl' => (int) env('STATS_CACHE_TTL', 0),
    ],

    'uploads' => [
        'photos_max' => 10485760,          // 5 x 10 MB evidence photos
        'photos_max_count' => 5,
        'resolution_max' => 6500000,       // base64-decoded proof cap (hook behaviour)
        'avatar_max' => 2097152,
        'resolution_uploads_max' => 8388608,
    ],

    'frontend_url' => env('APP_FRONTEND_URL', 'http://localhost:5173'),

    // Where browsers reach the websocket server; published by GET /api/config.
    // When not set, REVERB_HOST / _PORT / _SCHEME are used.
    'realtime' => [
        'public_host' => env('REVERB_PUBLIC_HOST'),
        'public_port' => env('REVERB_PUBLIC_PORT'),
        'public_scheme' => env('REVERB_PUBLIC_SCHEME'),
    ],
];
