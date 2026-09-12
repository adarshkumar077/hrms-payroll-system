<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('name');
            $table->string('sku')->nullable();
            $table->string('hsn')->nullable(); // HSN code — shared with Inventory + Finance
            $table->double('unit_price')->default(0);
            $table->double('tax_rate')->default(18); // GST %
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
