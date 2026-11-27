<?php

namespace App\Http\Controllers;

use App\Models\Complaint;
use App\Services\StaffScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffComplaintController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $scope = StaffScope::resolve($request->user());
        if (! $scope['ok']) {
            return response()->json(['error' => 'Staff routes require an active officer or admin account.'], 401);
        }

        // citizen is part of every row DTO: eager-loading it keeps the list
        // at a constant 3 queries instead of 1 + N (one per complaint).
        $query = Complaint::query()->with(['category', 'institution', 'citizen']);
        if (! $scope['isAdmin']) {
            $query->where('institution_id', $scope['instId']);
        }

        $rows = $query->orderByDesc('created_at')->limit(200)
            ->get()->map(fn (Complaint $c) => $c->staffRowDto())->all();

        return response()->json(['ok' => true, 'complaints' => $rows]);
    }

    public function show(Request $request): JsonResponse
    {
        $complaintId = (string) $request->input('p_complaint_id', '');
        $scope = StaffScope::resolve($request->user());
        if (! $scope['ok']) {
            return response()->json(['ok' => false, 'error' => 'not_authorized']);
        }
        if ($complaintId === '') {
            return response()->json(['ok' => false, 'error' => 'not_found']);
        }

        $complaint = StaffScope::scopedComplaint($complaintId, $scope);
        if (! $complaint) {
            return response()->json(['ok' => false, 'error' => 'not_found']);
        }

        return response()->json(['ok' => true, 'complaint' => $complaint->staffDto()]);
    }
}
