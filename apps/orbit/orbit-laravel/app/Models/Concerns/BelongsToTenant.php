<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;

trait BelongsToTenant
{
    /**
     * Scope the query to a specific tenant.
     * Used when you already know the tenant ID.
     * In production, the auth agent will wire a global scope that uses the current session tenant.
     */
    public function scopeForTenant(Builder $query, string $tenantId): Builder
    {
        return $query->where('tenant_id', $tenantId);
    }

    /**
     * Safety-net global scope: whenever a user is authenticated for the current
     * request, every read on a tenant-owned model is automatically filtered to
     * that user's tenant. This is defense-in-depth on top of the explicit
     * scopeForTenant() calls in controllers — if a query ever forgets to scope,
     * it still cannot cross tenants.
     *
     * It is a no-op when there is no authenticated user (console commands,
     * seeders, queued jobs, unit tests) — those paths scope explicitly. Use
     * Model::withoutGlobalScope('tenant') for the rare cross-tenant admin query.
     */
    protected static function booted(): void
    {
        static::addGlobalScope('tenant', function (Builder $query): void {
            if (! auth()->check()) {
                return;
            }
            $tenantId = auth()->user()->tenant_id ?? null;
            if ($tenantId) {
                $query->where($query->getModel()->getTable().'.tenant_id', $tenantId);
            }
        });
    }
}
