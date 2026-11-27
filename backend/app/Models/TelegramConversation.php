<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\UniqueConstraintViolationException;

/**
 * One row per Telegram chat: where the deterministic bot conversation
 * stands (state), what the citizen answered so far (data), and which
 * verified citizen account the chat is linked to (citizen_id).
 */
class TelegramConversation extends Model
{
    use HasUlids;

    protected $fillable = [
        'chat_id', 'telegram_user_id', 'telegram_name',
        'citizen_id', 'state', 'data', 'last_step_at',
    ];

    protected $casts = [
        'data' => 'array',
        'last_step_at' => 'datetime',
    ];

    public function citizen(): BelongsTo
    {
        return $this->belongsTo(User::class, 'citizen_id');
    }

    /** Load (or create) the conversation row for a chat and stamp activity. */
    public static function forChat(string $chatId, ?string $telegramUserId = null, ?string $telegramName = null): self
    {
        // Two webhook retries for the same chat can race the firstOrNew; the
        // chat_id unique index arbitrates and the loser continues with the
        // winner's row instead of 500-ing the update.
        for ($attempt = 0; $attempt < 2; $attempt++) {
            $conversation = static::firstOrNew(['chat_id' => $chatId]);
            if ($telegramUserId !== null && $conversation->telegram_user_id !== $telegramUserId) {
                $conversation->telegram_user_id = $telegramUserId;
            }
            if ($telegramName !== null && $conversation->telegram_name !== $telegramName) {
                $conversation->telegram_name = $telegramName;
            }
            if (! $conversation->exists) {
                $conversation->state = 'idle';
            }
            $conversation->last_step_at = now();
            try {
                $conversation->save();

                return $conversation;
            } catch (UniqueConstraintViolationException) {
                // Lost the insert race: loop once and continue with the existing row.
            }
        }

        return static::where('chat_id', $chatId)->firstOrFail();
    }
}
