<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Warehouse extends Model
{
    use BelongsToTenant;

    protected $table = 'warehouses';
    protected $fillable = [
        'id',
        'tenant_id',
        'name',
        'location',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
}
