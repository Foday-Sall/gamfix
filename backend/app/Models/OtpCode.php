<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class OtpCode extends Model
{
    use HasUlids;

    protected $fillable = [
        'user_id', 'phone', 'code_hash', 'attempts', 'expires_at', 'consumed_at', 'requested_ip',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
        ];
    }

    public static function hash(string $code): string
    {
        return hash_hmac('sha256', $code, (string) config('app.key'));
    }

    public static function pruneFor(string $phone): void
    {
        static::where('phone', $phone)
            ->where(function ($query) {
                $query->whereNotNull('consumed_at')->orWhere('expires_at', '<=', now());
            })
            ->delete();
    }
}
