<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class AppSecret extends Model
{
    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'value'];

    public function setValueAttribute($value): void
    {
        $this->attributes['value'] = $value === null ? null : Crypt::encryptString((string) $value);
    }

    public function getValueAttribute($value)
    {
        return $value === null ? null : Crypt::decryptString($value);
    }

    public static function isReserved(string $key): bool
    {
        return str_starts_with($key, 'GOWA_');
    }
}
