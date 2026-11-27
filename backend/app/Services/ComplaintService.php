<?php

namespace App\Services;

use App\Enums\ComplaintStatus;
use App\Models\Category;
use App\Models\Complaint;
use App\Models\ComplaintUpdate;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Throwable;

class ComplaintService
{
    public function __construct(private TrackingNumberService $tracking) {}

    public function create(User $citizen, array $data): array
    {
        $title = trim((string) ($data['p_title'] ?? ''));
        $description = trim((string) ($data['p_description'] ?? ''));
        if (mb_strlen($title) < 3 || mb_strlen($description) < 10) {
            return ['ok' => false, 'status' => 400, 'error' => 'A title and description are required'];
        }

        $externalId = strtoupper(trim((string) ($data['p_external_id'] ?? '')));
        if ($externalId !== '') {
            $existing = Complaint::where('external_id', $externalId)
                ->where('citizen_id', $citizen->id)
                ->first();
            if ($existing) {
                return $this->idempotent($existing);
            }
        }

        $category = Category::where('slug', (string) ($data['p_category_hint'] ?? ''))
            ->where('active', true)->first();
        $institution = $category?->defaultInstitution;
        if (! $institution) {
            $institution = Institution::where('code', (string) ($data['p_institution_code'] ?? ''))
                ->where('active', true)->first();
        }
        if (! $institution) {
            $institution = Institution::where('code', 'CENTRAL')->where('active', true)->first();
        }
        if (! $institution) {
            return ['ok' => false, 'status' => 400, 'error' => 'No institution could be resolved for this report.'];
        }

        $deadlineHours = $category?->deadline_hours ?? 72;
        $tracking = $this->tracking->generateUnique();
        $lat = isset($data['p_lat']) && is_numeric($data['p_lat']) ? (float) $data['p_lat'] : null;
        $lng = isset($data['p_lng']) && is_numeric($data['p_lng']) ? (float) $data['p_lng'] : null;
        $channel = (string) ($data['p_channel'] ?? 'web');

        try {
            $created = DB::transaction(function () use ($citizen, $institution, $category, $tracking, $data, $externalId, $lat, $lng, $channel, $deadlineHours) {
                $complaint = Complaint::query()->create([
                    'citizen_id' => $citizen->id,
                    'institution_id' => $institution->id,
                    'category_id' => $category?->id,
                    'tracking_no' => $tracking,
                    'title' => mb_substr(trim((string) ($data['p_title'] ?? '')), 0, 120),
                    'description' => trim((string) ($data['p_description'] ?? '')),
                    'status' => ComplaintStatus::Submitted,
                    'urgency' => $data['p_urgency_hint'] ?? null,
                    'council_area' => $data['p_council_area'] ?? null,
                    'region' => $data['p_region'] ?? null,
                    'ward' => $data['p_ward'] ?? null,
                    'landmark' => $data['p_landmark'] ?? null,
                    'lat' => $lat,
                    'lng' => $lng,
                    'is_anonymous' => (bool) ($data['p_is_anonymous'] ?? false),
                    'external_id' => $externalId !== '' ? $externalId : null,
                    'channel' => $channel,
                    'expected_response_at' => now()->addHours((int) $deadlineHours),
                ]);

                ComplaintUpdate::create([
                    'complaint_id' => $complaint->id,
                    'status' => ComplaintStatus::Submitted->value,
                    'message' => 'Report received. Tracking number '.$tracking.'.',
                    'update_type' => 'status',
                    'actor_label' => 'system',
                    'status_to' => ComplaintStatus::Submitted->value,
                    'citizen_message' => 'Report received. Tracking number '.$tracking.'.',
                    'is_citizen_visible' => true,
                ]);

                return $complaint;
            });
        } catch (UniqueConstraintViolationException) {
            $existing = $externalId !== '' ? Complaint::where('external_id', $externalId)->first() : null;

            if ($existing && $existing->citizen_id !== $citizen->id) {
                return ['ok' => false, 'status' => 409, 'error' => 'This report was already submitted.'];
            }

            return $existing
                ? $this->idempotent($existing)
                : ['ok' => false, 'status' => 500, 'error' => 'The report could not be saved. Please try again.'];
        } catch (Throwable $e) {
            report($e);

            return ['ok' => false, 'status' => 500, 'error' => 'The report could not be saved. Please try again.'];
        }

        $complaint = $created;

        return ['ok' => true, 'status' => 200, 'data' => [
            'tracking_no' => $complaint->tracking_no,
            'complaint_id' => $complaint->id,
            'institution' => $institution->code,
            'institution_name' => $institution->name,
        ]];
    }

    private function idempotent(Complaint $existing): array
    {
        return ['ok' => true, 'status' => 200, 'data' => [
            'tracking_no' => $existing->tracking_no,
            'complaint_id' => $existing->id,
            'institution' => $existing->institution?->code,
            'institution_name' => $existing->institution?->name,
        ]];
    }

    public static function addTimeline(
        Complaint $complaint,
        string $toStatus,
        ?string $citizenMessage,
        ?string $explanation = null,
        ?string $actorName = null,
        string $actorLabel = 'officer',
        ?string $fromStatus = null,
    ): ComplaintUpdate {
        $original = $complaint->getOriginal('status');
        if ($fromStatus === null) {
            $fromStatus = $original instanceof ComplaintStatus ? $original->value : (string) $original;
        }

        return ComplaintUpdate::create([
            'complaint_id' => $complaint->id,
            'status' => $toStatus,
            'message' => $citizenMessage,
            'update_type' => 'status',
            'actor_label' => $actorLabel,
            'actor' => $actorName,
            'status_from' => $fromStatus ?? $complaint->getOriginal('status'),
            'status_to' => $toStatus,
            'explanation' => $explanation,
            'citizen_message' => $citizenMessage,
            'is_citizen_visible' => (bool) $citizenMessage,
        ]);
    }
}
