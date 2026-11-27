<?php

namespace App\Services;

use App\Models\TelegramConversation;
use App\Models\TelegramLinkToken;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Throwable;

class TelegramLinkService
{
    public const TTL_MINUTES = 10;

    public function issue(User $user): ?array
    {
        $username = (string) config('gamfix.telegram_bot_username');
        if ($username === '') {
            return null;
        }

        TelegramLinkToken::where('user_id', $user->id)->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        $token = bin2hex(random_bytes(20));
        TelegramLinkToken::create([
            'user_id' => $user->id,
            'token_hash' => TelegramLinkToken::hash($token),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
        ]);

        return [
            'token' => $token,
            'url' => 'https://t.me/'.$username.'?start='.$token,
            'expires_in' => self::TTL_MINUTES * 60,
        ];
    }

    public function consume(string $token, string $telegramId, string $chatId, ?string $telegramName = null): ?array
    {
        $record = TelegramLinkToken::where('token_hash', TelegramLinkToken::hash($token))->first();
        if ($record === null || $record->consumed_at !== null || $record->expires_at->lte(now())) {
            return ['ok' => false, 'reason' => 'invalid'];
        }

        $consumed = TelegramLinkToken::where('id', $record->id)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);
        if ($consumed !== 1) {
            return ['ok' => false, 'reason' => 'invalid'];
        }

        $user = $record->user;
        if ($user === null || $user->role !== 'citizen') {
            return ['ok' => false, 'reason' => 'invalid'];
        }

        if (! $this->bind($user, $telegramId, $chatId, $telegramName)) {
            return ['ok' => false, 'reason' => 'taken'];
        }

        return ['ok' => true, 'user' => $user];
    }

    public function bind(User $user, string $telegramId, ?string $chatId = null, ?string $telegramName = null): bool
    {
        $other = User::where('telegram_id', $telegramId)->where('id', '!=', $user->id)->first();
        if ($other !== null) {
            return false;
        }

        try {
            DB::transaction(function () use ($user, $telegramId, $chatId): void {
                $user->forceFill([
                    'telegram_id' => $telegramId,
                    'telegram_chat_id' => $chatId,
                    'telegram_linked_at' => now(),
                ])->save();
            });
        } catch (Throwable) {
            return false;
        }

        if ($chatId !== null) {
            $conversation = TelegramConversation::forChat($chatId, $telegramId, $telegramName);
            $conversation->forceFill(['citizen_id' => $user->id, 'state' => 'idle', 'data' => null])->save();
        }

        return true;
    }
}
