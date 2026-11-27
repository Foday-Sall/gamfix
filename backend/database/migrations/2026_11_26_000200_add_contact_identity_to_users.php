<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('google_id')->nullable()->unique()->after('email');
            $table->string('telegram_id', 32)->nullable()->unique()->after('phone');
            $table->string('telegram_chat_id', 32)->nullable()->after('telegram_id');
            $table->timestamp('telegram_linked_at')->nullable()->after('telegram_chat_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['google_id', 'telegram_id', 'telegram_chat_id', 'telegram_linked_at']);
        });
    }
};
