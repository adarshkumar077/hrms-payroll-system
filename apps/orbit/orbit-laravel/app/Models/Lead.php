<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Lead extends Model
{
    use BelongsToTenant;

    protected $table = 'leads';
    protected $fillable = [
        'id',
        'tenant_id',
        'name',
        'company',
        'email',
        'phone',
        'source',
        'status',
        'score',
        'score_reason',
        'owner_id',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
