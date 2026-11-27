<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Indexes found by running the k6 load suite (VPS2) against the deployed
 * backend (VPS1) with 15k complaints / 19k updates seeded:
 *
 * - staff list:  WHERE institution_id = ? ORDER BY created_at DESC LIMIT 200
 *   examined 9110 rows + filesort on the (institution_id, status) index.
 *   (institution_id, created_at) lets MariaDB walk the index backwards and
 *   stop at 200 rows.
 * - staff map:   lat/lng bounding-box search had no index -> full scan of
 *   every complaint on each request. (lat, lng) prunes to the viewport.
 * - timelines:   complaint_updates were sorted by created_at inside each
 *   complaint (filesort per report); (complaint_id, created_at) reads them
 *   pre-sorted.
 * - otp verify:  latest unconsumed code per user read via (user_id) then
 *   sort; (user_id, created_at) removes the sort.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('complaints', function (Blueprint $table) {
            $table->index(['institution_id', 'created_at'], 'complaints_inst_created_index');
            $table->index(['lat', 'lng'], 'complaints_lat_lng_index');
        });

        Schema::table('complaint_updates', function (Blueprint $table) {
            $table->index(['complaint_id', 'created_at'], 'complaint_updates_complaint_created_index');
        });

        Schema::table('otp_codes', function (Blueprint $table) {
            $table->index(['user_id', 'created_at'], 'otp_codes_user_created_index');
        });
    }

    public function down(): void
    {
        Schema::table('complaints', function (Blueprint $table) {
            $table->dropIndex('complaints_inst_created_index');
            $table->dropIndex('complaints_lat_lng_index');
        });

        Schema::table('complaint_updates', function (Blueprint $table) {
            $table->dropIndex('complaint_updates_complaint_created_index');
        });

        Schema::table('otp_codes', function (Blueprint $table) {
            $table->dropIndex('otp_codes_user_created_index');
        });
    }
};
