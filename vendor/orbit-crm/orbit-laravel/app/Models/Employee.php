<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    use BelongsToTenant;

    protected $table = 'employees';
    protected $fillable = [
        'id',
        'tenant_id',
        'user_id',
        'code',
        'name',
        'email',
        'department',
        'designation',
        'manager_id',
        'date_of_joining',
        'ctc',
        'active',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
}
