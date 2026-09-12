<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendances', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('employee_id');
            $table->dateTime('date');
            $table->dateTime('check_in')->nullable();
            $table->dateTime('check_out')->nullable();
            $table->string('status')->default('Present'); // Present, Absent, HalfDay, WeekOff, Leave
            // Geofencing
            $table->double('check_in_lat')->nullable();
            $table->double('check_in_lng')->nullable();
            $table->double('distance_m')->nullable(); // distance from registered client address (m)
            $table->index(['tenant_id', 'employee_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendances');
    }
};
