<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('institutions', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('code', 20)->unique();               // KMC, NAWEC, NRA, NEA, POLICE, CENTRAL
            $table->string('name', 160);
            $table->string('type', 40)->nullable();
            $table->string('logo_url', 500)->nullable();
            $table->string('logo')->nullable();                 // managed (public) logo file
            $table->string('blurb', 300)->nullable();
            $table->boolean('active')->default(true);
            $table->json('contact')->nullable();                // {email, phone}
            $table->string('access_level', 20)->default('restricted'); // full | restricted | view-only
            $table->json('allowed_categories')->nullable();
            $table->unsignedInteger('sla_hours')->default(48);
            $table->unsignedInteger('max_complaints_per_day')->default(100);
            $table->string('status', 20)->default('active');    // active | suspended
            $table->timestamps();
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('slug', 80)->unique();
            $table->string('name', 160);
            $table->foreignUlid('default_institution_id')->nullable()
                ->constrained('institutions')->nullOnDelete();
            $table->boolean('is_sensitive')->default(false);
            $table->boolean('is_emergency')->default(false);
            $table->unsignedInteger('deadline_hours')->default(72);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('complaints', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('citizen_id')->constrained('users')->cascadeOnDelete();
            $table->foreignUlid('institution_id')->constrained('institutions');
            $table->foreignUlid('category_id')->nullable()->constrained('categories')->nullOnDelete();
            $table->string('tracking_no', 32)->unique();
            $table->string('title', 120);
            $table->text('description');
            $table->string('status', 40)->default('submitted');
            $table->string('urgency', 20)->nullable();
            $table->string('council_area', 80)->nullable();
            $table->string('region', 80)->nullable();
            $table->string('ward', 160)->nullable();
            $table->string('landmark', 300)->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->boolean('is_anonymous')->default(false);
            $table->string('officer', 120)->nullable();         // denormalised officer name (display)
            $table->string('department', 120)->nullable();
            $table->timestamp('expected_response_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->string('external_id', 100)->nullable()->unique(); // idempotency key
            $table->string('channel', 20)->default('web');      // web | whatsapp | ...
            $table->json('photos')->nullable();                 // protected evidence files (max 5)
            $table->json('resolution_photos')->nullable();      // protected proof file (max 1)
            $table->string('resolution_note', 2000)->nullable();
            $table->string('resolution_photo_url', 2000)->nullable();
            $table->unsignedInteger('reopened_count')->default(0);
            $table->timestamps();
            $table->index(['citizen_id', 'created_at']);
            $table->index(['institution_id', 'status']);
        });

        Schema::create('complaint_updates', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('complaint_id')->constrained('complaints')->cascadeOnDelete();
            $table->string('status', 40)->nullable();
            $table->string('message', 1000)->nullable();
            $table->string('update_type', 40)->nullable();      // status | assignment | ...
            $table->string('actor_label', 20)->nullable();      // system | officer
            $table->string('actor', 120)->nullable();
            $table->string('status_from', 40)->nullable();
            $table->string('status_to', 40)->nullable();
            $table->text('explanation')->nullable();            // staff-only context
            $table->text('citizen_message')->nullable();
            $table->boolean('is_citizen_visible')->default(true);
            $table->timestamps();
            $table->index('complaint_id');
        });

        Schema::create('officers', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('name', 160);
            $table->string('email', 160)->unique();
            $table->foreignUlid('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignUlid('institution_id')->constrained('institutions');
            $table->string('department', 80)->nullable();
            $table->string('role', 40)->default('officer');     // institution-admin | officer | view-only
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('admin_audit_log', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('actor_email', 160);
            $table->string('action', 60);
            $table->string('target_type', 60)->nullable();
            $table->string('target_id', 60)->nullable();
            $table->json('details')->nullable();
            $table->timestamps();
        });

        Schema::create('admin_settings', function (Blueprint $table) {
            $table->string('key', 60)->primary();
            $table->json('value')->nullable();
            $table->timestamps();
        });

        Schema::create('app_secrets', function (Blueprint $table) {
            $table->string('key', 80)->primary();
            $table->text('value')->nullable();                  // encrypted cast on the model
            $table->timestamps();
        });

        Schema::create('whatsapp_numbers', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('number', 20)->unique();
            $table->string('role', 20)->default('otp');         // otp | chat
            $table->string('status', 20)->default('pending');   // pending | linked | revoked
            $table->string('gowa_instance', 100)->nullable();
            $table->string('gowa_state', 40)->nullable();
            $table->string('gowa_jid', 100)->nullable();
            $table->timestamp('linked_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_numbers');
        Schema::dropIfExists('app_secrets');
        Schema::dropIfExists('admin_settings');
        Schema::dropIfExists('admin_audit_log');
        Schema::dropIfExists('officers');
        Schema::dropIfExists('complaint_updates');
        Schema::dropIfExists('complaints');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('institutions');
    }
};
