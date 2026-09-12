<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('opportunities', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('account_id')->nullable();
            $table->string('name');
            $table->double('amount')->default(0);
            $table->string('stage')->default('Qualification'); // Qualification, Proposal, Negotiation, ClosedWon, ClosedLost
            $table->integer('probability')->default(20);
            $table->dateTime('close_date')->nullable();
            $table->string('owner_id')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'stage']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('opportunities');
    }
};
