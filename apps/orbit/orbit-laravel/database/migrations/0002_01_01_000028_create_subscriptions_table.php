<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscriptions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->unique();
            $table->string('plan')->default('free'); // free, growth, scale
            $table->integer('seats')->default(5);
            $table->string('status')->default('active'); // active, past_due, canceled
            $table->string('provider')->nullable();
            $table->string('provider_ref')->nullable();
            $table->dateTime('current_period_end')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscriptions');
    }
};
