<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Role extends Model
{
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'tenant_id',
        'name',
        'permissions',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public $timestamps = false;

    protected static function booted(): void
    {
        static::creating(function (Role $role) {
            if (! $role->id) {
                $role->id = (string) Str::uuid();
            }
            if ($role->permissions === null) {
                $role->permissions = '{}';
            }
        });
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    /**
     * Decode the permissions JSON blob.
     *
     * Shape: { "leads": ["read","write"], "payroll": ["read"], "_fields": { "opportunity.amount": "hidden" } }
     */
    public function decodedPermissions(): array
    {
        try {
            return json_decode($this->permissions ?: '{}', true) ?: [];
        } catch (\Throwable) {
            return [];
        }
    }
}
