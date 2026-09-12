<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Item extends Model
{
    use BelongsToTenant;

    protected $table = 'items';
    protected $fillable = [
        'id',
        'tenant_id',
        'product_id',
        'name',
        'sku',
        'hsn',
        'uom',
        'on_hand',
        'reorder_level',
        'cost_price',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
}
