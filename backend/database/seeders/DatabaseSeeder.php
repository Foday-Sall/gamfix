<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Institution;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $institutions = [
            ['code' => 'KMC', 'name' => 'Kanifing Municipal Council', 'type' => 'municipal', 'blurb' => 'Waste collection, street lighting, local roads, markets.'],
            ['code' => 'NAWEC', 'name' => 'National Water and Electricity Company', 'type' => 'utility', 'blurb' => 'Water supply, electricity, sewerage.'],
            ['code' => 'NRA', 'name' => 'National Roads Authority', 'type' => 'infrastructure', 'blurb' => 'National roads, traffic signs, highways.'],
            ['code' => 'NEA', 'name' => 'National Environment Agency', 'type' => 'environment', 'blurb' => 'Pollution, illegal dumping, public health, environment.'],
            ['code' => 'POLICE', 'name' => 'Gambia Police Force', 'type' => 'security', 'blurb' => 'Crime reports, police misconduct, emergencies.'],
            ['code' => 'CENTRAL', 'name' => 'GamFix Central Desk', 'type' => 'central', 'blurb' => 'Reports that need review first: fraud, abuse of power, fires and more.'],
        ];

        foreach ($institutions as $row) {
            Institution::updateOrCreate(['code' => $row['code']], [
                'name' => $row['name'],
                'type' => $row['type'],
                'blurb' => $row['blurb'],
                'active' => true,
                'contact' => ['email' => '', 'phone' => ''],
                'allowed_categories' => [],
                'access_level' => 'restricted',
                'sla_hours' => 48,
                'max_complaints_per_day' => 100,
                'status' => 'active',
            ]);
        }

        $byCode = fn (string $code) => Institution::where('code', $code)->first();

        $categories = [
            ['water_supply', 'Water supply', 'NAWEC', false, false],
            ['electricity', 'Electricity', 'NAWEC', false, false],
            ['sewerage', 'Sewerage', 'NAWEC', false, false],
            ['waste_collection', 'Waste collection', 'KMC', false, false],
            ['streetlight', 'Street lighting', 'KMC', false, false],
            ['local_roads', 'Local roads', 'KMC', false, false],
            ['national_roads', 'National roads', 'NRA', false, false],
            ['traffic_signs', 'Traffic signs', 'NRA', false, false],
            ['pollution', 'Pollution', 'NEA', false, false],
            ['illegal_dumping', 'Illegal dumping', 'NEA', false, false],
            ['public_health', 'Public health', 'NEA', false, false],
            ['crime_report', 'Crime report', 'POLICE', true, false],
            ['police_misconduct', 'Police misconduct', 'CENTRAL', true, false],
            ['abuse_of_power', 'Abuse of power', 'CENTRAL', true, false],
            ['corruption_report', 'Corruption report', 'CENTRAL', true, false],
            ['emergency_fire', 'Fire emergency', 'CENTRAL', true, true],
            ['emergency_police', 'Police emergency', 'CENTRAL', true, true],
            ['other', 'Other problem', 'CENTRAL', false, false],
        ];

        foreach ($categories as [$slug, $name, $instCode, $sensitive, $emergency]) {
            Category::updateOrCreate(['slug' => $slug], [
                'name' => $name,
                'default_institution_id' => $byCode($instCode)?->id,
                'is_sensitive' => $sensitive,
                'is_emergency' => $emergency,
                'deadline_hours' => $emergency ? 4 : 72,
                'active' => true,
            ]);
        }

        $adminEmail = strtolower(trim((string) (config('gamfix.admin_emails')[0] ?? '')));
        if ($adminEmail === '') {
            $this->command?->warn('ADMIN_EMAILS is empty — no platform admin was provisioned. Set it to your own address in backend/.env.');

            return;
        }

        $admin = User::where('email', $adminEmail)->first();
        if (! $admin) {
            $this->command?->warn("No account for {$adminEmail} yet — register it in the app, then re-run db:seed to promote it to admin.");

            return;
        }

        $admin->role = 'admin';
        $admin->email_verified_at ??= now();
        $admin->save();
    }
}
