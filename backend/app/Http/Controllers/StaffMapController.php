<?php

namespace App\Http\Controllers;

use App\Enums\ComplaintStatus;
use App\Models\Category;
use App\Models\Complaint;
use App\Services\StaffScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StaffMapController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $scope = StaffScope::resolve($request->user());
        if (! $scope['ok']) {
            return response()->json(['ok' => false, 'error' => 'not_authorized']);
        }

        $west = $request->input('p_west');
        $south = $request->input('p_south');
        $east = $request->input('p_east');
        $north = $request->input('p_north');

        foreach ([$west, $south, $east, $north] as $bound) {
            if ($bound === null || ! is_numeric($bound)) {
                return response()->json(['ok' => false, 'error' => 'invalid_bounds']);
            }
        }

        $limit = min(max((int) $request->input('p_limit', 500), 1), 2000);

        // Sensitive categories are a tiny static list: excluding them with
        // whereNotIn prunes candidates by the (lat, lng) index, instead of a
        // correlated NOT EXISTS subquery that ran per row of a full scan.
        $sensitiveIds = Category::query()->where('is_sensitive', true)->pluck('id');

        $query = Complaint::query()
            ->with('category')
            ->whereNotNull('lat')->whereNotNull('lng')
            ->when($sensitiveIds->isNotEmpty(), fn ($q) => $q->whereNotIn('category_id', $sensitiveIds))
            ->whereBetween('lng', [(float) $west, (float) $east])
            ->whereBetween('lat', [(float) $south, (float) $north]);

        if (! $scope['isAdmin']) {
            $query->where('institution_id', $scope['instId']);
        }

        $rows = $query->limit($limit)->get()->map(fn (Complaint $c) => [
            'id' => $c->id,
            'tracking_no' => $c->tracking_no,
            'title' => $c->title,
            'status' => $c->status instanceof ComplaintStatus ? $c->status->value : $c->status,
            'urgency' => $c->urgency,
            'category' => $c->category?->name,
            'lat' => (float) $c->lat,
            'lng' => (float) $c->lng,
            'created' => $c->created_at?->toISOString(),
        ])->all();

        return response()->json(['ok' => true, 'complaints' => $rows]);
    }
}
