<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class PayrollRun extends Model
{
    use BelongsToTenant;

    protected $table = 'payroll_runs';
    protected $fillable = [
        'id',
        'tenant_id',
        'month',
        'year',
        'status',
        'gross_total',
        'net_total',
        'pf_total',
        'esi_total',
        'tds_total',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
