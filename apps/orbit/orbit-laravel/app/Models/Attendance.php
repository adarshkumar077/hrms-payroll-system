<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    use BelongsToTenant;

    protected $table = 'attendances';
    protected $fillable = [
        'id',
        'tenant_id',
        'employee_id',
        'date',
        'check_in',
        'check_out',
        'status',
        'check_in_lat',
        'check_in_lng',
        'distance_m',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
}
