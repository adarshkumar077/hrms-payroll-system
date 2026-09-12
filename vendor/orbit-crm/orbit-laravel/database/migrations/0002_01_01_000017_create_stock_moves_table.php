<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_moves', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('item_id');
            $table->string('warehouse_id')->nullable();
            $table->double('qty'); // +in / -out
            $table->string('type')->default('Adjustment'); // GRN, Sale, Adjustment, Transfer
            $table->string('ref')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_moves');
    }
};
