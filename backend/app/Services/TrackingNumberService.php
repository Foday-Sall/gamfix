<?php

namespace App\Services;

use App\Models\Complaint;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class TrackingNumberService
{
    public function generate(): string
    {
        $alphabet = config('gamfix.tracking_alphabet');
        $length = (int) config('gamfix.tracking_length');

        return 'GMC-'.now()->utc()->year.'-'
            .substr(str_shuffle(str_repeat($alphabet, 3)), 0, $length);
    }

    public function generateUnique(): string
    {
        for ($i = 0; $i < 8; $i++) {
            $candidate = $this->generate();
            if (! Complaint::where('tracking_no', $candidate)->exists()) {
                return $candidate;
            }
        }

        throw new RuntimeException('Unable to allocate a tracking number');
    }

    public static function withFirstTimeline(callable $creator): Complaint
    {
        return DB::transaction(function () use ($creator) {
            return $creator();
        });
    }
}
