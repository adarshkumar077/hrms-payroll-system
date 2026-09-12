<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LedgerAccount extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'id',
        'tenant_id',
        'code',
        'name',
        'type',
        'is_system',
        'created_at',
    ];

    protected $casts = [
        'is_system' => 'boolean',
        'created_at' => 'datetime',
    ];

    public function lines()
    {
        return $this->hasMany(JournalLine::class, 'account_id', 'id');
    }
}
