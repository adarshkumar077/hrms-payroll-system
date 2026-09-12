<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InvoiceLine extends Model
{
    protected $table = 'invoice_lines';
    protected $fillable = [
        'id',
        'invoice_id',
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
