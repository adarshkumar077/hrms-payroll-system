<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Background scheduled job (payroll reminders, SLA ageing, scheduled reports).
 * Renamed from "Job" to avoid collision with Laravel's built-in queue "jobs" table.
 */
class BackgroundJob extends Model
{
    protected $table = 'background_jobs';
    protected $fillable = [
        'id',
        'tenant_id',
        'type',
        'run_at',
        'status',
        'payload',
        'result',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
