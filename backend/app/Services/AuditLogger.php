<?php

namespace App\Services;

use App\Models\AdminAuditLog;

class AuditLogger
{
    public static function log(string $actorEmail, string $action, ?string $targetType = null, ?string $targetId = null, array $details = []): void
    {
        AdminAuditLog::create([
            'actor_email' => strtolower($actorEmail),
            'action' => $action,
            'target_type' => $targetType,
            'target_id' => $targetId,
            'details' => $details,
        ]);
    }
}
