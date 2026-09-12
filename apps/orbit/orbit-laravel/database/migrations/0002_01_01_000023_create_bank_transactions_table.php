<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bank_transactions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->dateTime('date');
            $table->string('description');
            $table->double('amount')->default(0);
            $table->string('direction')->default('credit'); // credit = money in, debit = money out
            $table->boolean('reconciled')->default(false);
            $table->string('matched_type')->nullable(); // payment, vendorbill, journal
            $table->string('matched_id')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'reconciled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_transactions');
    }
};
