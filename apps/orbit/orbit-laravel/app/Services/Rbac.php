<?php

namespace App\Services;

use App\Models\Role;
use App\Models\User;

/**
 * Module + field-level permission checks, mirroring lib/rbac.ts.
 *
 * Permissions JSON shape (stored on Role::$permissions):
 * { "leads": ["read","write"], "payroll": ["read"], "_fields": { "opportunity.amount": "hidden" } }
 */
class Rbac
{
    public const READ = 'read';

    public const WRITE = 'write';

    /**
     * Can the given user perform $action on $module?
     */
    public static function can(User $user, string $module, string $action): bool
    {
        if ($user->is_ceo) {
            return true; // CEO sees all
        }

        if (! $user->role_id) {
            // No role assigned → deny by default. (Previously open as a demo
            // convenience; that let any role-less user write. Admins must grant
            // a role via the Team screen to enable access.)
            return false;
        }

        $role = Role::find($user->role_id);
        if (! $role) {
            return true;
        }

        $perms = $role->decodedPermissions();
        $mod = $perms[$module] ?? null;
        if (! $mod) {
            return false;
        }

        return is_array($mod) && in_array($action, $mod, true);
    }

    /**
     * Is the given field hidden from this user?
     */
    public static function fieldHidden(User $user, string $fieldKey): bool
    {
        if ($user->is_ceo || ! $user->role_id) {
            return false;
        }

        $role = Role::find($user->role_id);
        if (! $role) {
            return false;
        }

        $perms = $role->decodedPermissions();

        return ($perms['_fields'][$fieldKey] ?? null) === 'hidden';
    }
}
