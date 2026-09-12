<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('user_id')->nullable(); // null = whole tenant
            $table->string('type')->default('info');
            $table->string('title');
            $table->string('body')->default('');
            $table->string('link')->nullable();
            $table->boolean('read')->default(false);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'user_id', 'read']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
