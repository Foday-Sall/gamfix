<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ComplaintActivity implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $complaintId,
        public string $citizenId,
        public string $institutionId,
        public string $action,
        public string $status,
    ) {}

    /**
     * Institution-only realtime: staff dashboards (admins + the owning
     * institution's officers) receive live complaint activity; citizens
     * stay on request/response (their app refetches on navigation and
     * action completion).
     *
     * @return array<int, PrivateChannel>
     */
    public function broadcastOn(): array
    {
        $channels = [new PrivateChannel('admins')];
        if ($this->institutionId !== '') {
            $channels[] = new PrivateChannel('institution.'.$this->institutionId);
        }

        return $channels;
    }

    public function broadcastAs(): string
    {
        return 'complaint.activity';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return [
            'action' => $this->action,
            'id' => $this->complaintId,
            'citizen_id' => $this->citizenId,
            'institution_id' => $this->institutionId,
            'status' => $this->status,
        ];
    }
}
