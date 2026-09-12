<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Ticket extends Model
{
    use BelongsToTenant;

    protected $table = 'tickets';
    protected $fillable = [
        'id',
        'tenant_id',
        'account_id',
        'subject',
        'priority',
        'status',
        'sla_due_at',
        'owner_id',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
