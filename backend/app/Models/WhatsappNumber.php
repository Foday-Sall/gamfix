<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class WhatsappNumber extends Model
{
    use HasUlids;

    protected $fillable = [
        'number', 'role', 'status', 'gowa_instance', 'gowa_state',
        'gowa_jid', 'linked_at', 'revoked_at',
    ];

    protected function casts(): array
    {
        return ['linked_at' => 'datetime', 'revoked_at' => 'datetime'];
    }

    public function dto(): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'role' => $this->role,
            'status' => $this->status,
            'gowa_instance' => $this->gowa_instance,
            'gowa_state' => $this->gowa_state,
            'gowa_jid' => $this->gowa_jid,
            'linked_at' => $this->linked_at?->toISOString(),
            'revoked_at' => $this->revoked_at?->toISOString(),
        ];
    }
}
