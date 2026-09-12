<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class EventLog extends Model
{
    use BelongsToTenant;

    protected $table = 'event_logs';
    protected $fillable = [
        'id',
        'tenant_id',
        'type',
        'entity',
        'entity_id',
        'payload',
        'actor_id',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
