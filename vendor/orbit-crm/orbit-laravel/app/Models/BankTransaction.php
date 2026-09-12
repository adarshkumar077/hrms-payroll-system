<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class BankTransaction extends Model
{
    use BelongsToTenant;

    protected $table = 'bank_transactions';
    protected $fillable = [
        'id',
        'tenant_id',
        'date',
        'description',
        'amount',
        'direction',
        'reconciled',
        'matched_type',
        'matched_id',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
