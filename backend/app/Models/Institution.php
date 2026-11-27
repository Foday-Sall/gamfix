<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Institution extends Model
{
    use HasUlids;

    protected $fillable = [
        'code', 'name', 'type', 'logo_url', 'logo', 'blurb', 'active',
        'contact', 'access_level', 'allowed_categories', 'sla_hours',
        'max_complaints_per_day', 'status',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'contact' => 'array',
            'allowed_categories' => 'array',
            'sla_hours' => 'integer',
            'max_complaints_per_day' => 'integer',
        ];
    }

    public function complaints(): HasMany
    {
        return $this->hasMany(Complaint::class);
    }

    public function officers(): HasMany
    {
        return $this->hasMany(Officer::class);
    }

    public function publicDto(): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'type' => $this->type,
            'logo_url' => $this->logo_url ?: ($this->logo
                ? url('/api/files/institutions/'.$this->id.'/'.$this->logo)
                : null),
            'blurb' => $this->blurb,
        ];
    }
}
