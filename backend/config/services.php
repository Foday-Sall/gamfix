<?php

return [
    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI', '/api/oauth2-redirect'),
    ],

    // The Telegram citizen bot is configured in config/nutgram.php
    // (TELEGRAM_BOT_TOKEN in backend/.env, docs/TELEGRAM-BOT.md).
];
