<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('activities', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('type')->default('Task'); // Task, Call, Meeting, Note
            $table->string('subject');
            $table->string('related_to')->nullable(); // "Lead:<id>" | "Opportunity:<id>" etc.
            $table->dateTime('due_date')->nullable();
            $table->boolean('done')->default(false);
            $table->string('summary')->nullable(); // AI call summary lands here
            $table->string('owner_id')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('activities');
    }
};
