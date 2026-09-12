<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VendorBillLine extends Model
{
    protected $table = 'vendor_bill_lines';
    protected $fillable = [
        'id',
        'vendor_bill_id',
        'description',
        'hsn',
        'qty',
        'unit_price',
        'tax_rate',
        'line_total',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
}
