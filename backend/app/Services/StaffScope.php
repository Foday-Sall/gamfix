<?php

namespace App\Services;

use App\Models\Complaint;
use App\Models\User;

class StaffScope
{
    public static function resolve(User $user): array
    {
        $isAdmin = $user->isAllowlistedAdmin();
        $officer = $user->activeOfficer();
        $isOfficer = $user->role === 'officer'
            && $user->institution_id
            && $officer !== null;

        if (! $isAdmin && ! $isOfficer) {
            return ['ok' => false, 'canWrite' => false, 'isAdmin' => false, 'officer' => null, 'user' => $user, 'instId' => null];
        }

        $canWrite = $isAdmin || (
            $officer->role !== 'view-only'
            && ($user->institution?->access_level !== 'view-only')
        );

        return [
            'ok' => true,
            'canWrite' => $canWrite,
            'isAdmin' => $isAdmin,
            'officer' => $isOfficer ? $officer : null,
            'user' => $user,
            'instId' => $isOfficer ? $user->institution_id : null,
        ];
    }

    public static function scopedComplaint(string $complaintId, array $scope, bool $lock = false): ?Complaint
    {
        $query = Complaint::with(['citizen', 'institution', 'category']);

        if ($lock) {
            $query->lockForUpdate();
        }

        /** @var Complaint|null $complaint */
        $complaint = $query->find($complaintId);
        if (! $complaint) {
            return null;
        }

        if (! $scope['isAdmin'] && $complaint->institution_id !== $scope['instId']) {
            return null;
        }

        return $complaint;
    }

    public static function actorName(array $scope): string
    {
        return $scope['officer']?->name ?? 'administrator';
    }
}
