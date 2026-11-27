<?php

use App\Support\AllowedOrigins;

return [
    'paths' => ['api/*', 'up'],
    'allowed_methods' => ['*'],
    // APP_URL (this server) plus the CORS_ORIGINS env, comma-separated. An
    // entry may contain `*` to cover every preview deployment of a Vercel
    // project, e.g.
    //   CORS_ORIGINS=https://gamfix.example.com,https://*-my-team.vercel.app
    // The `*` entries become the patterns below.
    'allowed_origins' => AllowedOrigins::exact(),
    'allowed_origins_patterns' => AllowedOrigins::patterns(),
    'allowed_headers' => ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    'exposed_headers' => [],
    'max_age' => 3600,
    'supports_credentials' => false,
];
