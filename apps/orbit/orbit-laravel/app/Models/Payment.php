<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    use BelongsToTenant;

    protected $table = 'payments';
    protected $fillable = [
        'id',
        'tenant_id',
        'invoice_id',
        'amount',
        'method',
        'reference',
        'receipt_no',
        'status',
        'provider',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
