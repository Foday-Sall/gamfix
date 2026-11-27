<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

/**
 * Registers (or removes) the Telegram webhook for the citizen bot.
 *
 *   php artisan telegram:webhook          # set, using APP_URL
 *   php artisan telegram:webhook --url=…  # set, overriding the public URL
 *   php artisan telegram:webhook --remove # unset
 *
 * The webhook is registered with Telegram's native secret-token mechanism
 * (md5 of APP_KEY), which Nutgram's safe mode and the webhook controller
 * both verify on every update. See docs/TELEGRAM-BOT.md.
 */
class TelegramSetWebhook extends Command
{
    protected $signature = 'telegram:webhook
        {--remove : Delete the webhook instead of setting it}
        {--drop-pending : Discard updates queued by Telegram (data loss: unprocessed citizen messages are deleted)}
        {--url= : Override the public webhook URL (defaults to APP_URL)}';

    protected $description = 'Register or remove the GamFix Telegram citizen bot webhook';

    public function handle(): int
    {
        $token = (string) config('nutgram.token');
        if ($token === '') {
            $this->error('TELEGRAM_BOT_TOKEN is not set. Put the @BotFather token in backend/.env first (docs/TELEGRAM-BOT.md).');

            return self::FAILURE;
        }

        if ($this->option('remove')) {
            $response = Http::asJson()->timeout(15)
                ->post("https://api.telegram.org/bot{$token}/deleteWebhook", ['drop_pending_updates' => (bool) $this->option('drop-pending')]);
            $this->info('deleteWebhook: '.($response->json('description') ?? $response->body()));

            return $response->json('ok') ? self::SUCCESS : self::FAILURE;
        }

        $key = (string) config('app.key');
        if ($key === '') {
            $this->error('APP_KEY is empty — generate one (php artisan key:generate) before registering the webhook.');

            return self::FAILURE;
        }

        $base = rtrim($this->option('url') ?: (string) config('app.url'), '/');
        if ($base === '') {
            $this->error('No public URL: set APP_URL in backend/.env or pass --url=https://…');

            return self::FAILURE;
        }

        $response = Http::asJson()->timeout(15)
            ->post("https://api.telegram.org/bot{$token}/setWebhook", [
                'url' => $base.'/api/telegram/webhook',
                'secret_token' => md5($key),
                'allowed_updates' => ['message', 'callback_query'],
                'drop_pending_updates' => (bool) $this->option('drop-pending'),
            ]);

        $this->info('setWebhook: '.($response->json('description') ?? $response->body()));
        if ($response->json('ok')) {
            $this->line('Registered URL: '.$base.'/api/telegram/webhook');
            $this->line('Secret: Telegram sends X-Telegram-Bot-Api-Secret-Token = md5(APP_KEY) — verified by the controller and Nutgram safe mode.');
            $this->line('Send /start to your bot in Telegram to test it.');
        }

        return $response->json('ok') ? self::SUCCESS : self::FAILURE;
    }
}
