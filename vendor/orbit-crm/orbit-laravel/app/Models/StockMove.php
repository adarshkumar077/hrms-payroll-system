<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class StockMove extends Model
{
    use BelongsToTenant;

    protected $table = 'stock_moves';
    protected $fillable = [
        'id',
        'tenant_id',
        'item_id',
        'warehouse_id',
        'qty',
        'type',
        'ref',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
