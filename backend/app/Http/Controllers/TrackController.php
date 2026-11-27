<?php

namespace App\Http\Controllers;

use App\Http\Requests\TrackRequest;
use App\Models\Complaint;
use Illuminate\Http\JsonResponse;

class TrackController extends Controller
{
    public function track(TrackRequest $request): JsonResponse
    {
        $data = $request->validated();

        $tracking = strtoupper(trim($data['p_tracking_no']));
        if ($tracking === '') {
            return response()->json(['error' => 'Tracking number is required'], 400);
        }

        $complaint = Complaint::with(['institution', 'category'])
            ->where('tracking_no', $tracking)
            ->first();
        if (! $complaint) {
            return response()->json(null);
        }

        return response()->json($complaint->trackDto());
    }
}
