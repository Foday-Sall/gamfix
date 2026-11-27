<?php

namespace App\Http\Controllers;

use App\Models\Institution;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffAccessController extends Controller
{
    public function resolve(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['ok' => false, 'role' => null]);
        }

        if ($user->isAllowlistedAdmin()) {
            return response()->json(['ok' => true, 'role' => 'admin']);
        }

        $institutionId = $user->institution_id;
        if ($user->role === 'officer' && $institutionId) {
            $officer = $user->activeOfficer();
            if ($officer && (string) $officer->institution_id === (string) $institutionId) {
                $institution = Institution::find($institutionId);
                if ($institution) {
                    return response()->json([
                        'ok' => true,
                        'role' => 'officer',
                        'institution' => [
                            'id' => $institution->id,
                            'code' => $institution->code,
                            'name' => $institution->name,
                            'logo_url' => $institution->logo_url ?: ($institution->logo
                                ? url('/api/files/institutions/'.$institution->id.'/'.$institution->logo)
                                : null),
                        ],
                    ]);
                }
            }
        }

        if ($user->role === 'citizen') {
            return response()->json(['ok' => true, 'role' => 'citizen']);
        }

        return response()->json(['ok' => false, 'role' => null]);
    }
}
