<?php

namespace App\Console\Commands;

use App\Models\AdminSetting;
use App\Models\Institution;
use App\Models\Officer;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class BootstrapStaff extends Command
{
    protected $signature = 'gamfix:bootstrap-staff {--token= : Must match STAFF_BOOTSTRAP_TOKEN}';

    protected $description = 'Create the allowlisted GamFix admin and institution officer accounts (one-time)';

    public function handle(): int
    {
        $expected = (string) config('gamfix.staff_bootstrap_token');
        if ($expected === '' || $this->option('token') !== $expected) {
            $this->error('bootstrap disabled');

            return self::FAILURE;
        }

        if (AdminSetting::value('staff_bootstrap_done')) {
            $this->error('bootstrap already completed');

            return self::FAILURE;
        }

        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        $newPassword = fn () => Str::substr(str_shuffle(str_repeat($alphabet, 2)), 0, 14).'!7Aa';

        $mapping = [
            ['nawec@pocketsoftware.dev', 'NAWEC'],
            ['kmc@pocketsoftware.dev', 'KMC'],
            ['nra@pocketsoftware.dev', 'NRA'],
            ['nea@pocketsoftware.dev', 'NEA'],
            ['police@pocketsoftware.dev', 'POLICE'],
        ];

        $created = [];

        $admin = User::where('email', config('gamfix.admin_emails')[0] ?? '')->first();
        if (! $admin) {
            $this->error('Admin user missing — run db:seed first');

            return self::FAILURE;
        }

        foreach ($mapping as [$email, $code]) {
            $institution = Institution::where('code', $code)->first();
            if (! $institution) {
                $created[] = "$email: institution missing $code";

                continue;
            }

            $user = User::firstOrNew(['email' => $email]);
            if (! $user->exists) {
                $password = $newPassword();
                $user->name = $institution->name.' Staff';
                $user->full_name = $institution->name.' Staff';
                $user->password = $password;
                $user->role = 'officer';
                $user->email_verified_at = now();
                $user->save();
                $created[] = "$email: created (temporary password: $password)";
            } else {
                $user->role = 'officer';
                $user->save();
                $created[] = "$email: existed, role set to officer";
            }

            $user->forceFill(['institution_id' => $institution->id])->save();

            Officer::updateOrCreate(['email' => $email], [
                'name' => $institution->name.' Officer',
                'user_id' => $user->id,
                'institution_id' => $institution->id,
                'role' => 'officer',
                'is_active' => true,
            ]);
        }

        AdminSetting::put('staff_bootstrap_done', true);

        foreach ($created as $line) {
            $this->line($line);
        }
        $this->info('Staff bootstrap completed and self-disabled.');

        return self::SUCCESS;
    }
}
