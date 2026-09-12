<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_applications', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('employee_id');
            $table->string('type')->default('Casual'); // Casual, Sick, Earned, Unpaid
            $table->dateTime('from_date');
            $table->dateTime('to_date');
            $table->double('days')->default(1);
            $table->string('status')->default('Pending'); // Pending, Approved, Rejected
            $table->string('reason')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_applications');
    }
};
