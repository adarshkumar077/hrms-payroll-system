<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Payslip extends Model
{
    protected $table = 'payslips';
    protected $fillable = [
        'id',
        'payroll_run_id',
        'employee_id',
        'gross',
        'basic',
        'pf_employee',
        'pf_employer',
        'esi_employee',
        'esi_employer',
        'pt',
        'tds',
        'loss_of_pay',
        'net_pay',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
}
