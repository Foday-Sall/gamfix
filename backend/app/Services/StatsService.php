<?php

namespace App\Services;

use App\Enums\ComplaintStatus;
use App\Models\Complaint;
use Illuminate\Database\Eloquent\Builder;

/**
 * Dashboard aggregates computed in SQL instead of hydrating thousands of
 * complaint rows into PHP. The original implementation loaded up to 2000
 * rows and ran O(days x rows) collection filters per request; everything
 * here is one grouped/conditional query the database answers with its
 * indexes, so the endpoints stay flat as the complaints table grows.
 */
class StatsService
{
    final public const OPEN_STATUSES = [
        'submitted', 'received', 'assigned', 'in_progress',
        'waiting_info', 'forwarded', 'escalated', 'reopened',
    ];

    /** The channel/urgency columns are free-form (max:20) — these cover what
     * the apps actually write; anything else falls back to a GROUP BY. */
    private const KNOWN_CHANNELS = ['web', 'telegram', 'whatsapp'];

    private const KNOWN_URGENCIES = ['high', 'medium', 'low'];

    /**
     * Whole-dashboard counters AND the per-status/-channel/-urgency
     * breakdowns in ONE conditional-aggregate scan. The staff stats
     * endpoint used to run four separate scans of the institution subset
     * (plus category + daily); each one starred in the slow-query log at
     * 50 VUs. Falls back to GROUP BY for unknown channel/urgency values.
     *
     * Returns: total, open, today, resolved_week, overdue, escalations_today,
     * by_status, by_channel, by_urgency.
     */
    public function breakdown(Builder $query): array
    {
        $statuses = array_column(ComplaintStatus::cases(), 'value');
        $openList = implode(',', array_map(fn ($s) => "'".$s."'", self::OPEN_STATUSES));
        $closedList = "'".ComplaintStatus::Resolved->value."','".ComplaintStatus::Closed->value."'";
        $conn = $query->getConnection();

        $columns = [
            'COUNT(*) as total',
            "SUM(CASE WHEN status IN ({$openList}) THEN 1 ELSE 0 END) as open",
            'SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as today',
            "SUM(CASE WHEN status IN ({$closedList}) AND resolved_at >= ? THEN 1 ELSE 0 END) as resolved_week",
            "SUM(CASE WHEN status IN ({$openList}) AND expected_response_at IS NOT NULL AND expected_response_at < ? THEN 1 ELSE 0 END) as overdue",
            "SUM(CASE WHEN status = '".ComplaintStatus::Escalated->value."' AND created_at >= ? THEN 1 ELSE 0 END) as escalations_today",
        ];
        $bindings = [now()->startOfDay(), now()->subDays(7), now(), now()->startOfDay()];

        foreach ($statuses as $status) {
            $columns[] = "SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as st_{$status}";
            $bindings[] = $status;
        }

        foreach (self::KNOWN_CHANNELS as $channel) {
            $columns[] = "SUM(CASE WHEN channel = ? THEN 1 ELSE 0 END) as ch_{$channel}";
            $bindings[] = $channel;
        }
        $columns[] = 'SUM(CASE WHEN channel IS NOT NULL AND channel NOT IN ('.implode(',', array_fill(0, count(self::KNOWN_CHANNELS), '?')).') THEN 1 ELSE 0 END) as ch_other';
        array_push($bindings, ...self::KNOWN_CHANNELS);

        foreach (self::KNOWN_URGENCIES as $urgency) {
            $columns[] = "SUM(CASE WHEN urgency = ? THEN 1 ELSE 0 END) as ug_{$urgency}";
            $bindings[] = $urgency;
        }
        $columns[] = 'SUM(CASE WHEN urgency IS NULL THEN 1 ELSE 0 END) as ug_none';
        $columns[] = 'SUM(CASE WHEN urgency IS NOT NULL AND urgency NOT IN ('.implode(',', array_fill(0, count(self::KNOWN_URGENCIES), '?')).') THEN 1 ELSE 0 END) as ug_other';
        array_push($bindings, ...self::KNOWN_URGENCIES);

        $row = (clone $query)->selectRaw(implode(', ', $columns))->addBinding($bindings, 'select')->first();

        $int = fn ($value) => (int) $value;
        $byStatus = [];
        foreach ($statuses as $status) {
            if (($count = $int($row->{"st_{$status}"})) > 0) {
                $byStatus[$status] = $count;
            }
        }

        $byChannel = [];
        foreach (self::KNOWN_CHANNELS as $channel) {
            if (($count = $int($row->{"ch_{$channel}"})) > 0) {
                $byChannel[$channel] = $count;
            }
        }
        $byUrgency = [];
        foreach (self::KNOWN_URGENCIES as $urgency) {
            if (($count = $int($row->{"ug_{$urgency}"})) > 0) {
                $byUrgency[$urgency] = $count;
            }
        }
        if ($int($row->ug_none) > 0) {
            $byUrgency[''] = $int($row->ug_none);   // null group, like GROUP BY did
        }

        // Free-form values the known lists missed: exact GROUP BY fallback.
        if ($int($row->ch_other) > 0) {
            $byChannel = $this->countsByColumn($query, 'channel');
        }
        if ($int($row->ug_other) > 0) {
            $byUrgency = $this->countsByColumn($query, 'urgency');
        }

        return [
            'total' => $int($row->total),
            'open' => $int($row->open),
            'today' => $int($row->today),
            'resolved_week' => $int($row->resolved_week),
            'overdue' => $int($row->overdue),
            'escalations_today' => $int($row->escalations_today),
            'by_status' => $byStatus,
            'by_channel' => $byChannel,
            'by_urgency' => $byUrgency,
        ];
    }

    /** Average created -> resolved duration in seconds (driver-aware). */
    public function avgResolutionSeconds(Builder $query): ?float
    {
        $seconds = $query->getConnection()->getDriverName() === 'mysql'
            ? 'AVG(TIMESTAMPDIFF(SECOND, created_at, resolved_at))'
            : 'AVG((julianday(resolved_at) - julianday(created_at)) * 86400)';

        $avg = (clone $query)
            ->whereNotNull('created_at')
            ->whereNotNull('resolved_at')
            ->selectRaw("{$seconds} as avg_seconds")
            ->value('avg_seconds');

        return $avg === null ? null : (float) $avg;
    }

    /** One grouped query per column (fallback for free-form domains). */
    public function countsByColumn(Builder $query, string $column): array
    {
        return (clone $query)
            ->groupBy($column)
            ->selectRaw("{$column} as value, COUNT(*) as count")
            ->pluck('count', 'value')
            ->map(fn ($count) => (int) $count)
            ->all();
    }

    public function countsByCategory(Builder $query): array
    {
        // Group inside the scoped complaints query, driven by the
        // (institution_id, created_at) index. Without the FORCE INDEX MariaDB
        // plans this as a category_id-index scan of every complaint in the
        // table (27k PK lookups, 10s under load per the slow-query log);
        // forced, it aggregates the institution subset through a small
        // in-memory temp table. The ~18 catalog names resolve in PHP.
        // SQLite (tests) has no index hints; only MySQL gets one.
        $builder = (clone $query);
        if ($builder->getConnection()->getDriverName() === 'mysql') {
            $builder->forceIndex('complaints_inst_created_index');
        }

        $byId = $builder
            ->whereNotNull('category_id')
            ->groupBy('category_id')
            ->selectRaw('category_id as value, COUNT(*) as count')
            ->pluck('count', 'value')
            ->map(fn ($count) => (int) $count)
            ->all();

        $names = $this->categoryNames();
        $named = [];
        foreach ($byId as $categoryId => $count) {
            $name = $names[$categoryId] ?? 'unknown';
            $named[$name] = ($named[$name] ?? 0) + $count;
        }
        ksort($named);

        $uncategorised = (int) (clone $query)->whereNull('category_id')->count();
        if ($uncategorised > 0) {
            $named['uncategorised'] = $uncategorised;
        }

        return $named;
    }

    /** The categories table is an ~18-row catalog; one query per request. */
    private function categoryNames(): array
    {
        return Complaint::query()->getConnection()
            ->table('categories')
            ->pluck('name', 'id')
            ->all();
    }

    /** Per-day received/resolved counts for the last $days days. */
    public function daily(Builder $query, int $days = 14): array
    {
        $start = now()->subDays($days - 1)->startOfDay();

        $received = (clone $query)
            ->whereBetween('created_at', [$start, now()])
            ->groupByRaw('DATE(created_at)')
            ->selectRaw('DATE(created_at) as day, COUNT(*) as count')
            ->pluck('count', 'day')
            ->map(fn ($count) => (int) $count)
            ->all();

        $resolved = (clone $query)
            ->whereNotNull('resolved_at')
            ->whereBetween('resolved_at', [$start, now()])
            ->groupByRaw('DATE(resolved_at)')
            ->selectRaw('DATE(resolved_at) as day, COUNT(*) as count')
            ->pluck('count', 'day')
            ->map(fn ($count) => (int) $count)
            ->all();

        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $day = now()->subDays($i)->startOfDay()->toDateString();
            $out[] = [
                'date' => $day,
                'received' => $received[$day] ?? 0,
                'resolved' => $resolved[$day] ?? 0,
            ];
        }

        return $out;
    }
}
