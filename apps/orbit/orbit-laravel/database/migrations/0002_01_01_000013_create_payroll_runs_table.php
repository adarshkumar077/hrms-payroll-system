<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_runs', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->integer('month');
            $table->integer('year');
            $table->string('status')->default('Draft'); // Draft, Locked, Paid
            $table->double('gross_total')->default(0);
            $table->double('net_total')->default(0);
            $table->double('pf_total')->default(0);
            $table->double('esi_total')->default(0);
            $table->double('tds_total')->default(0);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'year', 'month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_runs');
    }
};
