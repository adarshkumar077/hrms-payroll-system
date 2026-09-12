<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attachments', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('entity'); // "Employee", "Invoice", ...
            $table->string('entity_id');
            $table->string('filename');
            $table->string('url'); // storage path/URL
            $table->string('mime')->nullable();
            $table->integer('size')->default(0);
            $table->string('uploaded_by_id')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['tenant_id', 'entity', 'entity_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attachments');
    }
};
