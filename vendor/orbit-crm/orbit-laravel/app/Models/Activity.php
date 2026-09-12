<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Activity extends Model
{
    use BelongsToTenant;

    protected $table = 'activities';
    protected $fillable = [
        'id',
        'tenant_id',
        'type',
        'subject',
        'related_to',
        'due_date',
        'done',
        'summary',
        'owner_id',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
