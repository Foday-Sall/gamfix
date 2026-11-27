<?php

namespace App\Observers;

use App\Events\ComplaintActivity;
use App\Models\Complaint;

class ComplaintObserver
{
    public function created(Complaint $complaint): void
    {
        $this->broadcast('create', $complaint);
    }

    public function updated(Complaint $complaint): void
    {
        $this->broadcast('update', $complaint);
    }

    private function broadcast(string $action, Complaint $complaint): void
    {
        try {
            ComplaintActivity::dispatch(
                (string) $complaint->id,
                (string) ($complaint->citizen_id ?? ''),
                (string) ($complaint->institution_id ?? ''),
                $action,
                (string) $complaint->statusValue(),
            );
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
