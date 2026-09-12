<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SalaryStructure extends Model
{
    protected $table = 'salary_structures';
    protected $fillable = [
        'id',
        'tenant_id',
        'employee_id',
        'gross',
        'basic',
        'hra',
        'allowances',
        'compliant',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
}
