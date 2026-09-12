<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class QuotationLine extends Model
{
    protected $table = 'quotation_lines';
    protected $fillable = [
        'id',
        'quotation_id',
        'product_id',
        'description',
        'qty',
        'unit_price',
        'tax_rate',
        'line_total',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;
}
