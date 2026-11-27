<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('telegram_conversations', function (Blueprint $table) {
            $table->ulid('id')->primary();
            // Telegram chat ids exceed PHP's integer range, hence string.
            $table->string('chat_id')->unique();
            $table->string('telegram_user_id')->nullable()->index();
            $table->string('telegram_name')->nullable();
            $table->foreignUlid('citizen_id')->nullable()->constrained('users')->nullOnDelete();
            // The deterministic wizard position: idle | link_phone |
            // link_code | report_category | report_title | report_description
            // | report_photo | report_location | report_confirm
            $table->string('state', 32)->default('idle')->index();
            $table->json('data')->nullable();
            $table->timestamp('last_step_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('telegram_conversations');
    }
};
