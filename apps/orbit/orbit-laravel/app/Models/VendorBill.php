<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class VendorBill extends Model
{
    use BelongsToTenant;

    protected $table = 'vendor_bills';
    protected $fillable = [
        'id',
        'tenant_id',
        'vendor',
        'gstin',
        'bill_number',
        'date',
        'due_date',
        'subtotal',
        'tax',
        'total',
        'status',
        'source',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
