<?php

namespace App\Models;

use App\Enums\ComplaintStatus;
use App\Observers\ComplaintObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\URL;

#[ObservedBy(ComplaintObserver::class)]
class Complaint extends Model
{
    use HasUlids;

    protected $fillable = [
        'citizen_id', 'institution_id', 'category_id', 'tracking_no', 'title',
        'description', 'status', 'urgency', 'council_area', 'region', 'ward',
        'landmark', 'lat', 'lng', 'is_anonymous', 'officer', 'department',
        'expected_response_at', 'resolved_at', 'closed_at', 'external_id',
        'channel', 'photos', 'resolution_photos', 'resolution_note',
        'resolution_photo_url', 'reopened_count',
    ];

    protected function casts(): array
    {
        return [
            'lat' => 'float',
            'lng' => 'float',
            'is_anonymous' => 'boolean',
            'expected_response_at' => 'datetime',
            'resolved_at' => 'datetime',
            'closed_at' => 'datetime',
            'photos' => 'array',
            'resolution_photos' => 'array',
            'reopened_count' => 'integer',
            'status' => ComplaintStatus::class,
        ];
    }

    public function citizen(): BelongsTo
    {
        return $this->belongsTo(User::class, 'citizen_id');
    }

    public function institution(): BelongsTo
    {
        return $this->belongsTo(Institution::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function updates(): HasMany
    {
        return $this->hasMany(ComplaintUpdate::class);
    }

    public function statusValue(): string
    {
        return $this->status instanceof ComplaintStatus ? $this->status->value : (string) $this->status;
    }

    public function signedPhotoUrls(): array
    {
        return collect($this->photos ?? [])->map(
            fn (string $photo) => URL::temporarySignedRoute(
                'complaint.photo', now()->addMinutes(30),
                ['complaint' => $this->id, 'photo' => $photo],
            ),
        )->all();
    }

    public function trackDto(): array
    {
        $timeline = $this->updates()
            ->orderByDesc('created_at')->limit(100)->get()
            ->sortBy('created_at')->values()
            ->map(fn ($u) => [
                'status' => $u->status,
                'message' => $u->message,
                'at' => $u->created_at?->toISOString(),
            ])->all();

        return [
            'id' => $this->id,
            'tracking_no' => $this->tracking_no,
            'status' => $this->statusValue(),
            'urgency' => $this->urgency,
            'title' => $this->title,
            'description' => $this->description,
            'institution' => $this->institution?->name,
            'department' => null,
            'expected_response_at' => $this->expected_response_at?->toISOString(),
            'resolved_at' => $this->resolved_at?->toISOString(),
            'closed_at' => $this->closed_at?->toISOString(),
            'category' => $this->category?->name,
            'timeline' => $timeline,
        ];
    }

    public function citizenDto(): array
    {
        return [
            'id' => $this->id,
            'tracking_no' => $this->tracking_no,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->statusValue(),
            'urgency' => $this->urgency,
            'council_area' => $this->council_area,
            'region' => $this->region,
            'ward' => $this->ward,
            'landmark' => $this->landmark,
            'lat' => $this->lat,
            'lng' => $this->lng,
            'institution_id' => $this->institution_id,
            'institution' => $this->institution?->code,
            'institution_name' => $this->institution?->name,
            'category' => $this->category?->slug,
            'category_name' => $this->category?->name,
            'expected_response_at' => $this->expected_response_at?->toISOString(),
            'resolved_at' => $this->resolved_at?->toISOString(),
            'closed_at' => $this->closed_at?->toISOString(),
            'photos' => $this->photos,
            'resolution_photo_url' => $this->resolution_photo_url,
            'reopened_count' => $this->reopened_count,
            'channel' => $this->channel,
            'created' => $this->created_at?->toISOString(),
            'updated' => $this->updated_at?->toISOString(),
        ];
    }

    public function staffDto(): array
    {
        $contact = null;
        $avatarUrl = null;
        if (! $this->is_anonymous && $this->citizen) {
            $contact = [
                'email' => $this->citizen->email,
                'phone' => $this->citizen->phone,
                'full_name' => $this->citizen->full_name,
            ];
            if ($this->citizen->avatar) {
                $avatarUrl = URL::temporarySignedRoute(
                    'user.avatar', now()->addMinutes(30),
                    ['user' => $this->citizen->id, 'photo' => basename($this->citizen->avatar)],
                );
            }
        }

        $photoUrls = $this->signedPhotoUrls();

        return [
            'id' => $this->id,
            'institution_id' => $this->institution_id,
            'tracking_no' => $this->tracking_no,
            'title' => $this->title,
            'status' => $this->statusValue(),
            'urgency' => $this->urgency,
            'region' => $this->region,
            'ward' => $this->ward,
            'council_area' => $this->council_area,
            'landmark' => $this->landmark,
            'lat' => $this->lat,
            'lng' => $this->lng,
            'description' => $this->description,
            'category' => $this->category?->name,
            'category_slug' => $this->category?->slug,
            'is_sensitive' => (bool) $this->category?->is_sensitive,
            'channel' => $this->channel,
            'officer' => $this->officer,
            'department' => $this->department,
            'citizen_contact' => $contact,
            'citizen_avatar_url' => $avatarUrl,
            'photos' => $this->photos,
            'photo_urls' => $photoUrls,
            'photo_url' => $photoUrls[0] ?? null,
            'resolution_photo_url' => $this->resolution_photos ? $this->resolution_photos[0] : $this->resolution_photo_url,
            'resolution_note' => $this->resolution_note,
            'expected_response_at' => $this->expected_response_at?->toISOString(),
            'resolved_at' => $this->resolved_at?->toISOString(),
            'closed_at' => $this->closed_at?->toISOString(),
            'reopened_count' => $this->reopened_count,
            'created' => $this->created_at?->toISOString(),
        ];
    }

    public function staffRowDto(): array
    {
        return [
            'id' => $this->id,
            'institution_id' => $this->institution_id,
            'tracking_no' => $this->tracking_no,
            'title' => $this->title,
            'description' => $this->description,
            'status' => $this->statusValue(),
            'urgency' => $this->urgency,
            'region' => $this->region,
            'council_area' => $this->council_area,
            'ward' => $this->ward,
            'category' => $this->category?->name,
            'category_name' => $this->category?->name,
            'citizen_name' => $this->is_anonymous ? null : $this->citizen?->full_name,
            'citizen_phone' => $this->is_anonymous ? null : $this->citizen?->phone,
            'resolution_photo_url' => $this->resolution_photos ? $this->resolution_photos[0] : $this->resolution_photo_url,
            'is_sensitive' => (bool) $this->category?->is_sensitive,
            'is_anonymous' => (bool) $this->is_anonymous,
            'officer' => $this->officer,
            'channel' => $this->channel,
            'lat' => $this->lat,
            'lng' => $this->lng,
            'created' => $this->created_at?->toISOString(),
        ];
    }

    public function scopeVisibleTo($query, User $user)
    {
        if ($user->isAllowlistedAdmin()) {
            return $query;
        }

        return $query->where(function ($q) use ($user) {
            $q->where('citizen_id', $user->id)
                ->orWhere(function ($staff) use ($user) {
                    $staff->where('institution_id', $user->institution_id)
                        ->whereHas('institution.officers', function ($o) use ($user) {
                            $o->where('user_id', $user->id)->where('is_active', true);
                        });
                });
        });
    }
}
