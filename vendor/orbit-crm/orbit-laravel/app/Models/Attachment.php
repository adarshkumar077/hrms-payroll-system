<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class Attachment extends Model
{
    use BelongsToTenant;

    protected $table = 'attachments';
    protected $fillable = [
        'id',
        'tenant_id',
        'entity',
        'entity_id',
        'filename',
        'url',
        'mime',
        'size',
        'uploaded_by_id',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    const UPDATED_AT = null;
}
