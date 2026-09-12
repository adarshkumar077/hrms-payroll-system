<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Contact extends Model
{
    use BelongsToTenant;

    protected $table = 'contacts';
    protected $fillable = [
        'id',
        'tenant_id',
        'account_id',
        'name',
        'email',
        'phone',
        'title',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
