<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class TelegramUpdate extends Model
{
    use HasUlids;

    protected $fillable = ['update_id'];

    protected function casts(): array
    {
        return ['update_id' => 'integer'];
    }
}
