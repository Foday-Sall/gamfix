<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Officer extends Model
{
    use HasUlids;

    protected $fillable = [
        'name', 'email', 'user_id', 'institution_id', 'department', 'role', 'is_active',
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function dto(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'institution_id' => $this->institution_id,
            'institution_name' => $this->institution?->name,
            'department' => $this->department,
            'role' => $this->role,
            'is_active' => $this->is_active,
            'user_id' => $this->user_id,
        ];
    }
}
