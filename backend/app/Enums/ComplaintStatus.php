<?php

namespace App\Enums;

enum ComplaintStatus: string
{
    case Submitted = 'submitted';
    case Received = 'received';
    case Assigned = 'assigned';
    case InProgress = 'in_progress';
    case WaitingInfo = 'waiting_info';
    case Forwarded = 'forwarded';
    case CitizenConfirmation = 'citizen_confirmation';
    case Resolved = 'resolved';
    case Closed = 'closed';
    case Rejected = 'rejected';
    case Escalated = 'escalated';
    case Reopened = 'reopened';

    public const TRANSITIONS = [
        'submitted' => ['received', 'assigned', 'rejected', 'waiting_info', 'forwarded', 'escalated'],
        'received' => ['assigned', 'rejected', 'waiting_info', 'forwarded', 'escalated'],
        'assigned' => ['in_progress', 'waiting_info', 'forwarded', 'rejected', 'escalated'],
        'in_progress' => ['citizen_confirmation', 'waiting_info', 'forwarded', 'reopened'],
        'waiting_info' => ['in_progress', 'forwarded', 'rejected'],
        'forwarded' => ['assigned', 'received', 'submitted', 'in_progress', 'waiting_info', 'escalated', 'reopened'],
        'citizen_confirmation' => ['closed', 'reopened', 'resolved'],
        'resolved' => ['closed', 'reopened'],
        'closed' => ['reopened'],
        'rejected' => [],
        'escalated' => ['assigned', 'rejected', 'waiting_info', 'forwarded'],
        'reopened' => ['in_progress', 'waiting_info', 'forwarded', 'assigned', 'escalated'],
    ];

    public static function canTransition(string $from, string $to): bool
    {
        return in_array($to, self::TRANSITIONS[$from] ?? [], true);
    }

    public static function confirmable(): array
    {
        return [self::CitizenConfirmation->value, self::Resolved->value];
    }

    public static function reopenable(): array
    {
        return [self::Closed->value, self::Resolved->value, self::CitizenConfirmation->value];
    }
}
