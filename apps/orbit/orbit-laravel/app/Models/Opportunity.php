<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Opportunity extends Model
{
    use BelongsToTenant;

    protected $table = 'opportunities';
    protected $fillable = [
        'id',
        'tenant_id',
        'account_id',
        'name',
        'amount',
        'stage',
        'probability',
        'close_date',
        'owner_id',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
