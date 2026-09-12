<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Subscription extends Model
{
    protected $table = 'subscriptions';
    protected $fillable = [
        'id',
        'tenant_id',
        'plan',
        'seats',
        'status',
        'provider',
        'provider_ref',
        'current_period_end',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
