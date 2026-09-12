<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    use BelongsToTenant;

    protected $table = 'products';
    protected $fillable = [
        'id',
        'tenant_id',
        'name',
        'sku',
        'hsn',
        'unit_price',
        'tax_rate',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
