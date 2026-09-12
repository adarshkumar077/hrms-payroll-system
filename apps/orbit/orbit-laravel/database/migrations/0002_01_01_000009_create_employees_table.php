<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('tenant_id')->index();
            $table->string('user_id')->nullable()->unique();
            $table->string('code');
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('department')->nullable();
            $table->string('designation')->nullable();
            $table->string('manager_id')->nullable();
            $table->dateTime('date_of_joining')->useCurrent();
            $table->double('ctc')->default(0); // annual CTC ₹
            $table->boolean('active')->default(true);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employees');
    }
};
