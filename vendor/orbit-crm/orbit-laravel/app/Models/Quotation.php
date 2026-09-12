<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Quotation extends Model
{
    use BelongsToTenant;

    protected $table = 'quotations';
    protected $fillable = [
        'id',
        'tenant_id',
        'number',
        'opportunity_id',
        'status',
        'subtotal',
        'tax_total',
        'discount',
        'grand_total',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
