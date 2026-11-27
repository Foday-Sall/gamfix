<?php

namespace App\Services;

use App\Enums\ComplaintStatus;
use InvalidArgumentException;

class StatusMachine
{
    public static function assert(string $from, string $to): void
    {
        if (! ComplaintStatus::canTransition($from, $to)) {
            throw new InvalidArgumentException("Invalid status transition: {$from} -> {$to}");
        }
    }

    public static function allowed(string $from, array $to): bool
    {
        return in_array($from, $to, true);
    }
}
