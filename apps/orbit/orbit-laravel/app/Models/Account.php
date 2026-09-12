<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Account extends Model
{
    use BelongsToTenant;

    protected $table = 'accounts';
    protected $fillable = [
        'id',
        'tenant_id',
        'name',
        'industry',
        'phone',
        'email',
        'gstin',
        'address',
        'city',
        'state',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
