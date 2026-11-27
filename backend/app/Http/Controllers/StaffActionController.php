<?php

namespace App\Http\Controllers;

use App\Enums\ComplaintStatus;
use App\Models\Complaint;
use App\Models\Institution;
use App\Services\AuditLogger;
use App\Services\ComplaintService;
use App\Services\StaffScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class StaffActionController extends Controller
{
    public function accept(Request $request): JsonResponse
    {
        $scope = $this->scopeFor($request);
        if (! $scope['ok'] || ! $scope['canWrite']) {
            return response()->json(['ok' => false, 'error' => 'not_authorized']);
        }

        $result = DB::transaction(function () use ($request, $scope) {
            $complaint = StaffScope::scopedComplaint((string) $request->input('p_complaint_id', ''), $scope, true);
            if (! $complaint) {
                return ['error' => 'not_found'];
            }

            $from = $this->statusValue($complaint);
            $allowedFrom = [ComplaintStatus::Submitted->value, ComplaintStatus::Received->value, ComplaintStatus::Escalated->value];
            if (! in_array($from, $allowedFrom, true) || ! ComplaintStatus::canTransition($from, ComplaintStatus::Assigned->value)) {
                return ['error' => 'invalid_transition'];
            }

            $actor = StaffScope::actorName($scope);
            $complaint->status = ComplaintStatus::Assigned;
            $complaint->officer = $actor;
            $complaint->department = $scope['officer']?->department;
            $complaint->save();

            ComplaintService::addTimeline(
                $complaint,
                ComplaintStatus::Assigned->value,
                'Your report has been assigned to a staff member and will be handled now.',
                null,
                $actor,
                'officer',
                $from,
            );

            return ['status' => ComplaintStatus::Assigned->value];
        });

        if (isset($result['error'])) {
            return response()->json(['ok' => false, 'error' => $result['error']]);
        }

        return response()->json(['ok' => true, 'status' => $result['status']]);
    }

    public function setStatus(Request $request): JsonResponse
    {
        $scope = $this->scopeFor($request);
        if (! $scope['ok'] || ! $scope['canWrite']) {
            return response()->json(['ok' => false, 'error' => 'not_authorized']);
        }

        $result = DB::transaction(function () use ($request, $scope) {
            $complaint = StaffScope::scopedComplaint((string) $request->input('p_complaint_id', ''), $scope, true);
            if (! $complaint) {
                return ['error' => 'not_found'];
            }

            $from = $this->statusValue($complaint);
            $target = (string) $request->input('p_status', '');
            $message = trim((string) $request->input('p_message', ''));

            if ($target === ComplaintStatus::InProgress->value) {
                $allowedFrom = [ComplaintStatus::Assigned->value, ComplaintStatus::WaitingInfo->value, ComplaintStatus::Reopened->value];
                if (! in_array($from, $allowedFrom, true) || ! ComplaintStatus::canTransition($from, $target)) {
                    return ['error' => 'invalid_transition'];
                }
            } elseif ($target === ComplaintStatus::CitizenConfirmation->value) {
                if ($from !== ComplaintStatus::InProgress->value || mb_strlen($message) < 5) {
                    return ['error' => 'invalid_transition'];
                }
            } else {
                return ['error' => 'invalid_status'];
            }

            $actor = StaffScope::actorName($scope);
            $complaint->status = ComplaintStatus::from($target);
            if ($target === ComplaintStatus::CitizenConfirmation->value) {
                $complaint->resolved_at = now();
                $complaint->resolution_note = $message;
            }
            $complaint->save();

            ComplaintService::addTimeline(
                $complaint,
                $target,
                $message !== '' ? $message : 'Status updated to '.str_replace('_', ' ', $target).'.',
                null,
                $actor,
                'officer',
                $from,
            );

            return ['status' => $target];
        });

        if (isset($result['error'])) {
            return response()->json(['ok' => false, 'error' => $result['error']]);
        }

        return response()->json(['ok' => true, 'status' => $result['status']]);
    }

    public function resolution(Request $request): JsonResponse
    {
        $scope = $this->scopeFor($request);
        if (! $scope['ok'] || ! $scope['canWrite']) {
            return response()->json(['ok' => false, 'error' => 'not_authorized']);
        }

        $result = DB::transaction(function () use ($request, $scope) {
            $complaint = StaffScope::scopedComplaint((string) $request->input('p_complaint_id', ''), $scope, true);
            if (! $complaint) {
                return ['error' => 'not_found'];
            }

            $from = $this->statusValue($complaint);
            if ($from !== ComplaintStatus::InProgress->value) {
                return ['error' => 'invalid_transition'];
            }

            $message = trim((string) $request->input('p_message', ''));
            if (mb_strlen($message) < 5) {
                return ['error' => 'invalid_message'];
            }

            $proofUrl = (string) $request->input('p_proof_url', '');
            $proofBase64 = (string) $request->input('p_proof_base64', '');
            $storedPath = null;

            if ($proofBase64 !== '') {
                $decoded = base64_decode(preg_replace('#^data:image/\w+;base64,#i', '', $proofBase64), true);
                $max = (int) config('gamfix.uploads.resolution_max');
                if ($decoded === false || strlen($decoded) > $max) {
                    return ['error' => 'invalid_proof'];
                }

                $kind = $this->sniffImage($decoded);
                if ($kind === null) {
                    return ['error' => 'invalid_proof'];
                }

                $path = 'resolutions/'.$complaint->id.'/'.bin2hex(random_bytes(8)).'.'.$kind;
                Storage::disk('local')->put($path, $decoded);
                $storedPath = $path;
            } elseif ($proofUrl !== '') {
                if (! str_starts_with($proofUrl, 'https://') || strlen($proofUrl) > 2000) {
                    return ['error' => 'invalid_proof'];
                }
            } else {
                return ['error' => 'invalid_proof'];
            }

            $actor = StaffScope::actorName($scope);
            $complaint->status = ComplaintStatus::CitizenConfirmation;
            $complaint->resolved_at = now();
            $complaint->resolution_note = $message;
            if ($storedPath) {
                $complaint->resolution_photos = [$storedPath];
            } elseif ($proofUrl !== '') {
                $complaint->resolution_photo_url = $proofUrl;
            }
            $complaint->save();

            ComplaintService::addTimeline(
                $complaint,
                ComplaintStatus::CitizenConfirmation->value,
                $message,
                null,
                $actor,
                'officer',
                $from,
            );

            return ['status' => ComplaintStatus::CitizenConfirmation->value];
        });

        if (isset($result['error'])) {
            return response()->json(['ok' => false, 'error' => $result['error']]);
        }

        return response()->json(['ok' => true, 'status' => $result['status']]);
    }

    public function reject(Request $request): JsonResponse
    {
        return $this->simpleTransition($request, function (Complaint $complaint, string $from, array $scope) use ($request) {
            $reason = trim((string) $request->input('p_reason', ''));
            if (mb_strlen($reason) < 10) {
                return false;
            }

            $allowedFrom = [ComplaintStatus::Submitted->value, ComplaintStatus::Received->value, ComplaintStatus::Assigned->value, ComplaintStatus::Escalated->value, ComplaintStatus::WaitingInfo->value];
            if (! in_array($from, $allowedFrom, true) || ! ComplaintStatus::canTransition($from, ComplaintStatus::Rejected->value)) {
                return false;
            }

            $actor = StaffScope::actorName($scope);
            $complaint->status = ComplaintStatus::Rejected;
            $complaint->save();

            ComplaintService::addTimeline($complaint, ComplaintStatus::Rejected->value, $reason, $reason, $actor, 'officer', $from);

            return true;
        });
    }

    public function requestInfo(Request $request): JsonResponse
    {
        return $this->simpleTransition($request, function (Complaint $complaint, string $from, array $scope) use ($request) {
            $message = trim((string) $request->input('p_message', ''));
            if (mb_strlen($message) < 10) {
                return false;
            }

            $allowedFrom = [ComplaintStatus::Submitted->value, ComplaintStatus::Received->value, ComplaintStatus::Assigned->value, ComplaintStatus::InProgress->value, ComplaintStatus::Escalated->value, ComplaintStatus::Reopened->value];
            if (! in_array($from, $allowedFrom, true) || ! ComplaintStatus::canTransition($from, ComplaintStatus::WaitingInfo->value)) {
                return false;
            }

            $actor = StaffScope::actorName($scope);
            $complaint->status = ComplaintStatus::WaitingInfo;
            $complaint->save();

            ComplaintService::addTimeline($complaint, ComplaintStatus::WaitingInfo->value, $message, $message, $actor, 'officer', $from);

            return true;
        });
    }

    public function forward(Request $request): JsonResponse
    {
        $reason = trim((string) $request->input('p_reason', ''));
        $targetInstitutionId = (string) $request->input('p_target_institution_id', '');
        if (mb_strlen($reason) < 10 || $targetInstitutionId === '') {
            return response()->json(false);
        }

        $scope = $this->scopeFor($request);
        if (! $scope['ok'] || ! $scope['canWrite']) {
            return response()->json(false);
        }

        $target = Institution::where('id', $targetInstitutionId)->where('active', true)->first();
        if (! $target) {
            return response()->json(false);
        }

        $forwarded = DB::transaction(function () use ($request, $target, $reason, $scope) {
            $complaint = StaffScope::scopedComplaint((string) $request->input('p_complaint_id', ''), $scope, true);
            if (! $complaint || $target->id === $complaint->institution_id) {
                return false;
            }

            $from = $complaint->statusValue();
            $allowedFrom = [ComplaintStatus::Submitted->value, ComplaintStatus::Received->value, ComplaintStatus::Assigned->value, ComplaintStatus::InProgress->value, ComplaintStatus::WaitingInfo->value, ComplaintStatus::Escalated->value, ComplaintStatus::Reopened->value];
            if (! in_array($from, $allowedFrom, true) || ! ComplaintStatus::canTransition($from, ComplaintStatus::Forwarded->value)) {
                return false;
            }

            $actor = StaffScope::actorName($scope);
            $fromInstitution = $complaint->institution?->name;

            $complaint->institution_id = $target->id;
            $complaint->officer = null;
            $complaint->department = null;
            $complaint->status = ComplaintStatus::Forwarded;
            $complaint->save();

            ComplaintService::addTimeline(
                $complaint,
                ComplaintStatus::Forwarded->value,
                'Your report was passed from '.($fromInstitution ?? 'the institution').' to '.$target->name.'.',
                $reason,
                $actor,
                'officer',
                $from,
            );

            return true;
        });

        return response()->json($forwarded);
    }

    public function proof(Request $request): JsonResponse
    {
        $scope = $this->scopeFor($request);
        if (! $scope['ok'] || ! $scope['canWrite']) {
            return response()->json(false);
        }

        $proofUrl = trim((string) $request->input('p_photo_url', ''));
        if (! str_starts_with($proofUrl, 'https://') || strlen($proofUrl) > 2000) {
            return response()->json(false);
        }

        $ok = DB::transaction(function () use ($request, $scope, $proofUrl) {
            $complaint = StaffScope::scopedComplaint((string) $request->input('p_complaint_id', ''), $scope, true);
            if (! $complaint) {
                return false;
            }

            $complaint->resolution_photo_url = $proofUrl;
            $complaint->save();

            AuditLogger::log(
                $request->user()->email,
                'attach_proof',
                'complaint',
                $complaint->id,
                ['proof_url' => $proofUrl],
            );

            return true;
        });

        return response()->json($ok);
    }

    private function simpleTransition(Request $request, \Closure $apply): JsonResponse
    {
        $scope = $this->scopeFor($request);
        if (! $scope['ok'] || ! $scope['canWrite']) {
            return response()->json(false);
        }

        $ok = DB::transaction(function () use ($request, $scope, $apply) {
            $complaint = StaffScope::scopedComplaint((string) $request->input('p_complaint_id', ''), $scope, true);
            if (! $complaint) {
                return false;
            }

            return $apply($complaint, $complaint->statusValue(), $scope);
        });

        return response()->json($ok);
    }

    private function scopeFor(Request $request): array
    {
        return StaffScope::resolve($request->user());
    }

    private function statusValue(Complaint $complaint): string
    {
        return $complaint->status instanceof ComplaintStatus ? $complaint->status->value : (string) $complaint->status;
    }

    private function sniffImage(string $bytes): ?string
    {
        if (str_starts_with($bytes, "\xFF\xD8\xFF")) {
            return 'jpg';
        }
        if (str_starts_with($bytes, "\x89PNG\r\n\x1A\n")) {
            return 'png';
        }
        if (str_starts_with($bytes, 'RIFF') && strlen($bytes) > 11 && substr($bytes, 8, 4) === 'WEBP') {
            return 'webp';
        }

        return null;
    }
}
