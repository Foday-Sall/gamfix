<?php

namespace App\Http\Controllers;

use App\Models\Complaint;
use App\Services\StaffScope;
use App\Services\StatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class StaffStatsController extends Controller
{
    public function __construct(private StatsService $stats) {}

    public function index(Request $request): JsonResponse
    {
        $scope = StaffScope::resolve($request->user());
        if (! $scope['ok']) {
            return response()->json(['ok' => false, 'error' => 'not_authorized']);
        }

        // Every concurrent stats request re-running the aggregate scans
        // multiplied the CPU bill (fpm slowlog: requests queued inside
        // PDO::execute on a 2-core box). Dashboards tolerate a short cache,
        // so the whole payload is cached per scope when STATS_CACHE_TTL > 0.
        $ttl = (int) config('gamfix.stats.cache_ttl');
        $key = 'gamfix:staff-stats:'.($scope['isAdmin'] ? 'all' : (string) $scope['instId']);

        $stats = $ttl > 0
            ? Cache::remember($key, $ttl, fn () => $this->build($scope))
            : $this->build($scope);

        return response()->json(['ok' => true, 'stats' => $stats]);
    }

    private function build(array $scope): array
    {
        $query = Complaint::query();
        if (! $scope['isAdmin']) {
            $query->where('institution_id', $scope['instId']);
        }

        // One conditional-aggregate scan covers every counter and the
        // status/channel/urgency breakdowns; category, daily and the
        // resolution average are one further query each.
        $breakdown = $this->stats->breakdown($query);
        $avgSeconds = $this->stats->avgResolutionSeconds($query);

        return [
            'total' => $breakdown['total'],
            'today' => $breakdown['today'],
            'open' => $breakdown['open'],
            'resolved_week' => $breakdown['resolved_week'],
            'overdue' => $breakdown['overdue'],
            'avg_resolution_hours' => $avgSeconds === null ? null : round($avgSeconds / 3600, 1),
            'by_status' => $breakdown['by_status'],
            'by_category' => $this->stats->countsByCategory($query),
            'by_channel' => $breakdown['by_channel'],
            'by_urgency' => $breakdown['by_urgency'],
            'daily' => $this->stats->daily($query),
        ];
    }
}
