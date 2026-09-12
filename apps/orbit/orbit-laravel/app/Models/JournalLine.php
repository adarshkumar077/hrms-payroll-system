<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JournalLine extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'id',
        'journal_entry_id',
        'tenant_id',
        'account_id',
        'account_code',
        'debit',
        'credit',
        'created_at',
    ];

    protected $casts = [
        'debit' => 'float',
        'credit' => 'float',
        'created_at' => 'datetime',
    ];

    public function entry()
    {
        return $this->belongsTo(JournalEntry::class, 'journal_entry_id', 'id');
    }

    public function account()
    {
        return $this->belongsTo(LedgerAccount::class, 'account_id', 'id');
    }
}
