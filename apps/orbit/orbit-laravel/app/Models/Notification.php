<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    use BelongsToTenant;

    protected $table = 'notifications';
    protected $fillable = [
        'id',
        'tenant_id',
        'user_id',
        'type',
        'title',
        'body',
        'link',
        'read',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
