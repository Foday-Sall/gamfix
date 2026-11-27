<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ComplaintUpdate extends Model
{
    use HasUlids;

    protected $fillable = [
        'complaint_id', 'status', 'message', 'update_type', 'actor_label',
        'actor', 'status_from', 'status_to', 'explanation', 'citizen_message',
        'is_citizen_visible',
    ];

    protected function casts(): array
    {
        return ['is_citizen_visible' => 'boolean'];
    }

    public function complaint(): BelongsTo
    {
        return $this->belongsTo(Complaint::class);
    }
}
