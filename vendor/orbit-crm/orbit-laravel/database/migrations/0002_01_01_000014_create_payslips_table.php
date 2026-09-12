<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payslips', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('payroll_run_id');
            $table->string('employee_id');
            $table->double('gross')->default(0);
            $table->double('basic')->default(0);
            $table->double('pf_employee')->default(0); // 12% of basic (capped 15k)
            $table->double('pf_employer')->default(0);
            $table->double('esi_employee')->default(0); // 0.75% if wage <= 21k
            $table->double('esi_employer')->default(0); // 3.25%
            $table->double('pt')->default(0); // professional tax (state slab)
            $table->double('tds')->default(0);
            $table->double('loss_of_pay')->default(0);
            $table->double('net_pay')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payslips');
    }
};
