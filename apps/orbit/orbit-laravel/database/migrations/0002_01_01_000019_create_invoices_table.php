<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('account_id')->nullable();
            $table->string('number');
            $table->string('invoice_type')->default('B2B'); // B2B, B2C
            $table->string('place_of_supply')->nullable();
            $table->double('subtotal')->default(0);
            $table->double('cgst')->default(0);
            $table->double('sgst')->default(0);
            $table->double('igst')->default(0);
            $table->double('grand_total')->default(0);
            $table->string('status')->default('Draft'); // Draft, Finalized, Paid
            // e-invoicing
            $table->string('irn')->nullable(); // 64-char Invoice Reference Number (once finalized, if AATO > 5cr B2B)
            $table->string('ack_no')->nullable();
            $table->string('eway_bill_no')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
