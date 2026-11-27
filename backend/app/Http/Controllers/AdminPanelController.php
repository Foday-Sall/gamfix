<?php

namespace App\Http\Controllers;

use App\Models\AdminAuditLog;
use App\Models\AdminSetting;
use App\Models\Complaint;
use App\Models\Institution;
use App\Models\Officer;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\StatsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class AdminPanelController extends Controller
{
    public function __construct(private StatsService $stats) {}

    public function action(Request $request): JsonResponse
    {
        $action = (string) $request->input('action', '');
        $params = (array) $request->input('params', []);
        $actor = strtolower((string) $request->user()->email);

        $p = fn (string $key) => $params[$key] ?? null;

        switch ($action) {
            case 'getOverviewStats':
                // Same as the staff console: cached per scope (the admin
                // scope sees everything) when STATS_CACHE_TTL > 0.
                $ttl = (int) config('gamfix.stats.cache_ttl');

                $data = $ttl > 0
                    ? Cache::remember('gamfix:admin-stats:all', $ttl, fn () => $this->overviewData())
                    : $this->overviewData();

                return response()->json(['ok' => true, 'data' => $data]);

            case 'getInstitutions':
                $data = Institution::orderBy('code')
                    ->withCount([
                        'complaints as open_complaints' => fn ($q) => $q->whereIn('status', ['submitted', 'received', 'assigned', 'in_progress', 'waiting_info', 'forwarded', 'escalated', 'reopened']),
                        'officers as officer_count' => fn ($q) => $q->where('is_active', true),
                    ])
                    ->get()->map(function (Institution $inst) {
                        return [
                            'id' => $inst->id,
                            'name' => $inst->name,
                            'code' => $inst->code,
                            'contact' => $inst->contact ?? ['email' => '', 'phone' => ''],
                            'access_level' => $inst->access_level,
                            'allowed_categories' => $inst->allowed_categories ?? [],
                            'sla_hours' => (int) $inst->sla_hours,
                            'max_complaints_per_day' => (int) $inst->max_complaints_per_day,
                            'open_complaints' => $inst->open_complaints,
                            'officer_count' => $inst->officer_count,
                            'status' => $inst->status,
                            'logo_url' => $inst->logo_url ?: ($inst->logo ? url('/api/files/institutions/'.$inst->id.'/'.$inst->logo) : null),
                        ];
                    })->all();

                return response()->json(['ok' => true, 'data' => $data]);
            case 'createInstitution':
                $name = trim((string) $p('p_name'));
                $shortcode = strtoupper(trim((string) $p('p_shortcode')));
                if ($name === '' || $shortcode === '' || strlen($shortcode) > 20) {
                    return response()->json(['ok' => false, 'error' => 'invalid_params']);
                }
                if (Institution::where('code', $shortcode)->exists()) {
                    return response()->json(['ok' => false, 'error' => 'duplicate_shortcode']);
                }
                $inst = Institution::create([
                    'code' => $shortcode,
                    'name' => $name,
                    'contact' => [
                        'email' => (string) $p('p_contact_email'),
                        'phone' => (string) $p('p_phone'),
                    ],
                    'access_level' => 'restricted',
                    'allowed_categories' => [],
                    'sla_hours' => 48,
                    'max_complaints_per_day' => 100,
                    'status' => 'active',
                    'active' => true,
                ]);
                AuditLogger::log($actor, 'create_institution', 'institution', $inst->id, ['code' => $shortcode]);

                return response()->json(['ok' => true, 'data' => ['id' => $inst->id, 'code' => $inst->code, 'name' => $inst->name]]);

            case 'getOfficers':
                $data = Officer::with('institution')->orderBy('name')->get()->map(fn (Officer $o) => $o->dto())->all();

                return response()->json(['ok' => true, 'data' => $data]);

            case 'createOfficer':
                $name = trim((string) $p('p_name'));
                $email = strtolower(trim((string) $p('p_email')));
                $institutionId = (string) $p('p_institution_id');
                $role = (string) ($p('p_role') ?: 'officer');
                $department = (string) $p('p_department');
                if ($name === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL) || ! Institution::find($institutionId)) {
                    return response()->json(['ok' => false, 'error' => 'invalid_params']);
                }
                if (User::where('email', $email)->exists() || Officer::where('email', $email)->exists()) {
                    return response()->json(['ok' => false, 'error' => 'duplicate_email']);
                }

                $temporaryPassword = Str::random(12).'!7Aa';
                $user = new User([
                    'name' => $name,
                    'email' => $email,
                    'password' => $temporaryPassword,
                ]);
                $user->full_name = $name;
                $user->role = 'officer';
                $user->institution_id = $institutionId;
                $user->email_verified_at = now();
                $user->save();

                $officer = Officer::create([
                    'name' => $name,
                    'email' => $email,
                    'user_id' => $user->id,
                    'institution_id' => $institutionId,
                    'department' => $department !== '' ? $department : null,
                    'role' => in_array($role, ['institution-admin', 'officer', 'view-only'], true) ? $role : 'officer',
                    'is_active' => true,
                ]);

                AuditLogger::log($actor, 'create_officer', 'officer', $officer->id, ['email' => $email]);

                return response()->json([
                    'ok' => true,
                    'officer' => $officer->dto(),
                    'temporaryPassword' => $temporaryPassword,
                ]);

            case 'toggleOfficerActive':
                $officer = Officer::find((string) $p('p_officer_id'));
                if (! $officer) {
                    return response()->json(['ok' => false, 'error' => 'not_found']);
                }
                $officer->is_active = (bool) ($p('p_active') ?? false);
                $officer->save();
                if ($officer->user) {
                    if (! $officer->is_active) {
                        $officer->user->tokens()->delete();
                    }
                    $officer->user->save();
                }
                AuditLogger::log($actor, 'toggle_officer_active', 'officer', $officer->id, ['is_active' => $officer->is_active]);

                return response()->json(['ok' => true, 'data' => $officer->dto()]);

            case 'getAccessLimits':
                $inst = Institution::find((string) $p('p_institution_id'));
                if (! $inst) {
                    return response()->json(['ok' => false, 'error' => 'not_found']);
                }

                return response()->json(['ok' => true, 'data' => [
                    'access_level' => $inst->access_level,
                    'allowed_categories' => $inst->allowed_categories ?? [],
                    'sla_hours' => (int) $inst->sla_hours,
                    'max_complaints_per_day' => (int) $inst->max_complaints_per_day,
                ]]);

            case 'setAccessLevel':
                $inst = Institution::find((string) $p('p_institution_id'));
                $level = (string) $p('p_level');
                if (! $inst || ! in_array($level, ['full', 'restricted', 'view-only'], true)) {
                    return response()->json(['ok' => false, 'error' => 'invalid_params']);
                }
                $inst->access_level = $level;
                $inst->save();
                AuditLogger::log($actor, 'set_access_level', 'institution', $inst->id, ['level' => $level]);

                return response()->json(['ok' => true]);

            case 'setAllowedCategories':
                $inst = Institution::find((string) $p('p_institution_id'));
                $categories = $p('p_categories');
                if (! $inst || ! is_array($categories)) {
                    return response()->json(['ok' => false, 'error' => 'invalid_params']);
                }
                $inst->allowed_categories = array_values(array_map(strval(...), $categories));
                $inst->save();
                AuditLogger::log($actor, 'set_allowed_categories', 'institution', $inst->id, ['count' => count($categories)]);

                return response()->json(['ok' => true]);

            case 'setSlaHours':
                $inst = Institution::find((string) $p('p_institution_id'));
                $hours = (int) $p('p_hours');
                if (! $inst || $hours < 1) {
                    return response()->json(['ok' => false, 'error' => 'invalid_params']);
                }
                $inst->sla_hours = $hours;
                $inst->save();
                AuditLogger::log($actor, 'set_sla_hours', 'institution', $inst->id, ['hours' => $hours]);

                return response()->json(['ok' => true]);

            case 'setRateLimit':
                $inst = Institution::find((string) $p('p_institution_id'));
                $max = (int) $p('p_max');
                if (! $inst || $max < 1) {
                    return response()->json(['ok' => false, 'error' => 'invalid_params']);
                }
                $inst->max_complaints_per_day = $max;
                $inst->save();
                AuditLogger::log($actor, 'set_rate_limit', 'institution', $inst->id, ['max' => $max]);

                return response()->json(['ok' => true]);

            case 'getAuditLog':
                $limit = min(max((int) ($p('p_limit') ?: 100), 1), 500);
                $data = AdminAuditLog::orderByDesc('created_at')->limit($limit)->get()
                    ->map(fn (AdminAuditLog $row) => [
                        'id' => $row->id,
                        'actor_email' => $row->actor_email,
                        'action' => $row->action,
                        'target_type' => $row->target_type,
                        'target_id' => $row->target_id,
                        'details' => $row->details,
                        'created' => $row->created_at?->toISOString(),
                    ])->all();

                return response()->json(['ok' => true, 'data' => $data]);

            case 'getSettings':
                return response()->json(['ok' => true, 'data' => AdminSetting::value('dashboard', [])]);

            case 'saveSettings':
                AdminSetting::put('dashboard', $p('p_settings') ?? []);
                AuditLogger::log($actor, 'save_settings', 'admin_settings', 'dashboard', []);

                return response()->json(['ok' => true]);

            default:
                return response()->json(['ok' => false, 'error' => 'unknown_action']);
        }
    }

    private function overviewData(): array
    {
        $breakdown = $this->stats->breakdown(Complaint::query());
        $avgSeconds = $this->stats->avgResolutionSeconds(Complaint::query());

        return [
            'total_complaints' => $breakdown['total'],
            'open_complaints' => $breakdown['open'],
            'escalations_today' => $breakdown['escalations_today'],
            'avg_first_response_minutes' => $avgSeconds === null ? null : (int) round($avgSeconds / 60),
            'by_category' => $this->stats->countsByCategory(Complaint::query()),
            'daily' => $this->stats->daily(Complaint::query()),
        ];
    }
}
