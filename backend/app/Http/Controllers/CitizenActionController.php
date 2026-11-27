<?php

namespace App\Http\Controllers;

use App\Enums\ComplaintStatus;
use App\Models\Complaint;
use App\Models\ComplaintUpdate;
use App\Services\ComplaintService;
use App\Services\StatusMachine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CitizenActionController extends Controller
{
    public function canConfirm(Request $request): JsonResponse
    {
        $complaintId = (string) $request->input('p_complaint_id', '');
        $complaint = Complaint::find($complaintId);

        if (! $complaint || $complaint->citizen_id !== $request->user()->id) {
            return response()->json(false);
        }

        $confirmable = StatusMachine::allowed(
            $complaint->status instanceof ComplaintStatus ? $complaint->status->value : (string) $complaint->status,
            ComplaintStatus::confirmable(),
        );

        return response()->json($confirmable);
    }

    public function confirm(Request $request): JsonResponse
    {
        $confirmed = DB::transaction(function () use ($request) {
            $complaint = Complaint::whereKey((string) $request->input('p_complaint_id', ''))
                ->lockForUpdate()
                ->first();

            if (! $complaint || $complaint->citizen_id !== $request->user()->id) {
                return false;
            }

            $from = $complaint->status instanceof ComplaintStatus ? $complaint->status->value : (string) $complaint->status;
            if (! StatusMachine::allowed($from, ComplaintStatus::confirmable())) {
                return false;
            }

            try {
                StatusMachine::assert($from, ComplaintStatus::Closed->value);
            } catch (\InvalidArgumentException) {
                return false;
            }

            $complaint->status = ComplaintStatus::Closed;
            $complaint->closed_at = now();
            $complaint->save();

            ComplaintService::addTimeline(
                $complaint,
                ComplaintStatus::Closed->value,
                'You confirmed this report is fixed. Thank you!',
                null,
                'citizen',
                'citizen',
                $from,
            );

            return true;
        });

        return response()->json($confirmed);
    }

    public function reopen(Request $request): JsonResponse
    {
        $data = $request->validate([
            'p_complaint_id' => ['required', 'string'],
            'p_reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        $reopened = DB::transaction(function () use ($request, $data) {
            $complaint = Complaint::whereKey((string) $data['p_complaint_id'])
                ->lockForUpdate()
                ->first();

            if (! $complaint || $complaint->citizen_id !== $request->user()->id) {
                return false;
            }

            $from = $complaint->status instanceof ComplaintStatus ? $complaint->status->value : (string) $complaint->status;
            if (! StatusMachine::allowed($from, ComplaintStatus::reopenable())) {
                return false;
            }

            try {
                StatusMachine::assert($from, ComplaintStatus::Reopened->value);
            } catch (\InvalidArgumentException) {
                return false;
            }

            $complaint->status = ComplaintStatus::Reopened;
            $complaint->closed_at = null;
            $complaint->resolved_at = null;
            $complaint->reopened_count = ($complaint->reopened_count ?? 0) + 1;
            $complaint->save();

            ComplaintService::addTimeline(
                $complaint,
                ComplaintStatus::Reopened->value,
                'The report was reopened: '.trim($data['p_reason']),
                trim($data['p_reason']),
                'citizen',
                'citizen',
                $from,
            );

            return true;
        });

        return response()->json($reopened);
    }

    public function updates(Request $request): JsonResponse
    {
        $complaintId = (string) $request->input('complaint', '');
        $complaint = Complaint::find($complaintId);

        if (! $complaint || $complaint->citizen_id !== $request->user()->id) {
            return response()->json(['updates' => []]);
        }

        $rows = ComplaintUpdate::where('complaint_id', $complaint->id)
            ->orderBy('created_at')
            ->get()
            ->map(fn (ComplaintUpdate $u) => [
                'id' => $u->id,
                'status' => $u->status,
                'message' => $u->message,
                'update_type' => $u->update_type,
                'actor_label' => $u->actor_label,
                'actor' => $u->actor,
                'status_from' => $u->status_from,
                'status_to' => $u->status_to,
                'citizen_message' => $u->citizen_message,
                'is_citizen_visible' => $u->is_citizen_visible,
                'created' => $u->created_at?->toISOString(),
            ])->all();

        return response()->json(['updates' => $rows]);
    }
}
