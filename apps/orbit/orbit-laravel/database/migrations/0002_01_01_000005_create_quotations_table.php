<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quotations', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('number');
            $table->string('opportunity_id')->nullable();
            $table->string('status')->default('Draft'); // Draft, Sent, Accepted, Rejected
            $table->double('subtotal')->default(0);
            $table->double('tax_total')->default(0);
            $table->double('discount')->default(0);
            $table->double('grand_total')->default(0);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quotations');
    }
};
