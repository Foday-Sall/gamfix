<?php

namespace App\Models;

use App\Notifications\ResetPasswordUrl;
use App\Notifications\VerifyEmailUrl;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasUlids, Notifiable;

    protected $fillable = [
        'name', 'email', 'google_id', 'password', 'full_name', 'role', 'phone',
        'phone_verified', 'telegram_id', 'telegram_chat_id', 'telegram_linked_at',
        'institution_id', 'department',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified' => 'boolean',
            'telegram_linked_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function hasCompletedProfile(): bool
    {
        return $this->phone_verified && trim((string) $this->full_name) !== '';
    }

    public function telegramConnected(): bool
    {
        return $this->telegram_id !== null;
    }

    public function unlinkTelegram(): void
    {
        TelegramConversation::where('citizen_id', $this->id)->update(['citizen_id' => null]);
        $this->forceFill([
            'telegram_id' => null,
            'telegram_chat_id' => null,
            'telegram_linked_at' => null,
        ])->save();
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function complaints(): HasMany
    {
        return $this->hasMany(Complaint::class, 'citizen_id');
    }

    public function officerProfile(): HasMany
    {
        return $this->hasMany(Officer::class);
    }

    /**
     * The admin allowlist is the single source of truth for platform
     * ownership: an exact e-mail on the list is an administrator, forever,
     * regardless of the stored role. Signing in (password or Google) with
     * an allowlisted e-mail always opens the admin console.
     */
    public static function isAdminEmail(string $email): bool
    {
        $allowlist = array_map(
            'strtolower',
            array_filter((array) config('gamfix.admin_emails', [])),
        );

        return in_array(strtolower(trim($email)), $allowlist, true);
    }

    public function isAllowlistedAdmin(): bool
    {
        return static::isAdminEmail((string) $this->email);
    }

    /** Re-assert admin for allowlisted e-mails (idempotent self-heal). */
    public function promoteIfAdminEmail(): void
    {
        if (! static::isAdminEmail((string) $this->email)) {
            return;
        }

        if ($this->role !== 'admin' || $this->email_verified_at === null) {
            $this->forceFill([
                'role' => 'admin',
                'email_verified_at' => $this->email_verified_at ?? now(),
            ])->save();
        }
    }

    public function activeOfficer(): ?Officer
    {
        return $this->officerProfile()
            ->where('is_active', true)
            ->where('institution_id', $this->institution_id)
            ->first();
    }

    public function dto(bool $withTokenAbilities = false): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'verified' => $this->email_verified_at !== null,
            'full_name' => $this->full_name,
            'name' => $this->name,
            'role' => $this->role,
            'phone' => $this->phone,
            'phone_verified' => (bool) $this->phone_verified,
            'institution_id' => $this->institution_id,
            'avatar' => $this->avatar,
            'telegram' => $this->telegramConnected() ? [
                'id' => $this->telegram_id,
                'connected' => true,
                'connected_at' => $this->telegram_linked_at?->toISOString(),
            ] : ['connected' => false],
            'avatar_url' => $this->avatar
                ? URL::temporarySignedRoute(
                    'user.avatar', now()->addMinutes(30),
                    ['user' => $this->id, 'photo' => basename($this->avatar)],
                )
                : null,
            'created' => $this->created_at?->toISOString(),
        ];
    }

    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new VerifyEmailUrl);
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPasswordUrl($token));
    }
}
