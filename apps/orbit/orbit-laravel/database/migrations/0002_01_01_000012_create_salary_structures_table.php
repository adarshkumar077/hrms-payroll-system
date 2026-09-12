<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('salary_structures', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('employee_id')->unique();
            $table->double('gross')->default(0); // monthly gross ₹
            $table->double('basic')->default(0); // must be >= 50% of gross (2025 Labour Codes)
            $table->double('hra')->default(0);
            $table->double('allowances')->default(0);
            $table->boolean('compliant')->default(true); // basic >= 50% gross check
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('salary_structures');
    }
};
