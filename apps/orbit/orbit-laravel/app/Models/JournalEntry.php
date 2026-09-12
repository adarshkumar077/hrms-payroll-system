<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JournalEntry extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'id',
        'tenant_id',
        'date',
        'narration',
        'reference',
        'source',
        'created_at',
    ];

    protected $casts = [
        'date' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function lines()
    {
        return $this->hasMany(JournalLine::class, 'journal_entry_id', 'id');
    }
}
