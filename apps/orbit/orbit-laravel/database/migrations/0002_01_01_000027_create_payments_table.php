<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('invoice_id')->nullable();
            $table->double('amount')->default(0);
            $table->string('method')->default('Manual'); // Manual, UPI, Razorpay, NEFT, Cash
            $table->string('reference')->nullable();
            $table->string('receipt_no');
            $table->string('status')->default('Success'); // Success, Pending, Failed
            $table->string('provider')->nullable(); // razorpay, ...
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'invoice_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
