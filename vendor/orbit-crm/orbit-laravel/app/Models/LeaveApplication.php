<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class LeaveApplication extends Model
{
    use BelongsToTenant;

    protected $table = 'leave_applications';
    protected $fillable = [
        'id',
        'tenant_id',
        'employee_id',
        'type',
        'from_date',
        'to_date',
        'days',
        'status',
        'reason',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
