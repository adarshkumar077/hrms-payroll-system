<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('items', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('product_id')->nullable()->unique();
            $table->string('name');
            $table->string('sku')->nullable();
            $table->string('hsn')->nullable();
            $table->string('uom')->default('Nos');
            $table->double('on_hand')->default(0);
            $table->double('reorder_level')->default(0);
            $table->double('cost_price')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('items');
    }
};
