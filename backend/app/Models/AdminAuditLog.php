<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class AdminAuditLog extends Model
{
    use HasUlids;

    protected $fillable = ['actor_email', 'action', 'target_type', 'target_id', 'details'];

    protected function casts(): array
    {
        return ['details' => 'array'];
    }
}
