<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class PurchaseOrder extends Model
{
    use BelongsToTenant;

    protected $table = 'purchase_orders';
    protected $fillable = [
        'id',
        'tenant_id',
        'number',
        'vendor',
        'status',
        'total',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
