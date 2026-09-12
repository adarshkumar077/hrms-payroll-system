<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Invoice extends Model
{
    use BelongsToTenant;

    protected $table = 'invoices';
    protected $fillable = [
        'id',
        'tenant_id',
        'account_id',
        'number',
        'invoice_type',
        'place_of_supply',
        'subtotal',
        'cgst',
        'sgst',
        'igst',
        'grand_total',
        'status',
        'irn',
        'ack_no',
        'eway_bill_no',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
