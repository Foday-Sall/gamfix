<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('realtime_events');
        Schema::dropIfExists('realtime_subs');
    }

    public function down(): void {}
};
