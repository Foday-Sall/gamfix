<?php

/** @var Nutgram $bot */

use App\Services\TelegramBotService;
use SergiX44\Nutgram\Nutgram;

/*
|--------------------------------------------------------------------------
| GamFix Telegram citizen bot handlers
|--------------------------------------------------------------------------
|
| The deterministic conversation lives in TelegramBotService with its state
| in the telegram_conversations table. Everything below only forwards the
| update, so the flow is fixed: link account -> category -> title ->
| description -> photos -> location -> confirm.
|
| Handler callables only type-hint Nutgram itself: the message contact,
| location and callback data are read from the $bot proxies, which keeps
| the container from autowiring empty Telegram types.
|
*/

$service = TelegramBotService::class;

$bot->onCommand('start', fn (Nutgram $bot) => app($service)->start($bot))->description('Welcome + link your account');
$bot->onCommand('help', fn (Nutgram $bot) => app($service)->help($bot))->description('How the bot works');
$bot->onCommand('cancel', fn (Nutgram $bot) => app($service)->cancel($bot))->description('Cancel the current report');
$bot->onCommand('track', fn (Nutgram $bot) => app($service)->track($bot))->description('Check a report: /track ABC123XYZ');

$bot->onContact(fn (Nutgram $bot) => app($service)->contact($bot, $bot->message()?->contact));
$bot->onLocation(fn (Nutgram $bot) => app($service)->location($bot, $bot->message()?->location));
$bot->onPhoto(fn (Nutgram $bot) => app($service)->photo($bot));

$bot->onCallbackQuery(fn (Nutgram $bot) => app($service)->callback($bot, (string) ($bot->callbackQuery()?->data ?? '')));

$bot->onMessage(fn (Nutgram $bot) => app($service)->message($bot));
