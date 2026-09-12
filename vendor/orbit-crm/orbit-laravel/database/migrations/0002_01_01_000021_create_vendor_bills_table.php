<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vendor_bills', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('vendor');
            $table->string('gstin')->nullable();
            $table->string('bill_number');
            $table->dateTime('date')->useCurrent();
            $table->dateTime('due_date')->nullable();
            $table->double('subtotal')->default(0);
            $table->double('tax')->default(0);
            $table->double('total')->default(0);
            $table->string('status')->default('Draft'); // Draft, Approved, Paid
            $table->string('source')->default('manual'); // manual, ocr
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vendor_bills');
    }
};
