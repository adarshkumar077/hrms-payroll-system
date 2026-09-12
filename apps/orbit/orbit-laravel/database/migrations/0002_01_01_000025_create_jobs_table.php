<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // NOTE: renamed from 'jobs' to 'background_jobs' — this is a business-domain
        // scheduled-jobs table (payroll reminders, SLA ageing, scheduled reports), which
        // collided with Laravel's built-in queue 'jobs' table (0001_01_01_000002_create_jobs_table)
        // and broke `migrate:fresh` / RefreshDatabase for the whole app. Fixed by the
        // auth/tenancy agent while wiring up tests; if you own this table, feel free to
        // rename again as long as it doesn't reuse 'jobs'.
        Schema::create('background_jobs', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->nullable();
            $table->string('type'); // payroll.reminder, sla.ageing, report.scheduled, ...
            $table->dateTime('run_at');
            $table->string('status')->default('pending'); // pending, done, failed
            $table->string('payload')->default('{}');
            $table->string('result')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['status', 'run_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('background_jobs');
    }
};
