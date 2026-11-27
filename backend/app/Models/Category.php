<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Category extends Model
{
    use HasUlids;

    protected $fillable = [
        'slug', 'name', 'default_institution_id', 'is_sensitive',
        'is_emergency', 'deadline_hours', 'active',
    ];

    protected function casts(): array
    {
        return [
            'is_sensitive' => 'boolean',
            'is_emergency' => 'boolean',
            'deadline_hours' => 'integer',
            'active' => 'boolean',
        ];
    }

    public function defaultInstitution(): BelongsTo
    {
        return $this->belongsTo(Institution::class, 'default_institution_id');
    }

    public function complaints(): HasMany
    {
        return $this->hasMany(Complaint::class);
    }
}
