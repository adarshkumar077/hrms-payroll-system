<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quotation_lines', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('quotation_id');
            $table->string('product_id')->nullable();
            $table->string('description');
            $table->double('qty')->default(1);
            $table->double('unit_price')->default(0);
            $table->double('tax_rate')->default(18);
            $table->double('line_total')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quotation_lines');
    }
};
