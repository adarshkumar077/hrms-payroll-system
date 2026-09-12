<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Support\Totp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Profile / Team management API.
 *
 * - Profile + password + 2FA endpoints act on the authenticated user only.
 * - Team + role endpoints are tenant-scoped; write actions (invite, toggle,
 *   role assignment) require the caller to be the tenant's CEO.
 */
class SettingsController extends Controller
{
    /**
     * PATCH /api/profile — update the current user's name.
     * tenant_id / id / is_ceo are intentionally not accepted here.
     */
    public function updateProfile(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $user->name = $data['name'];
        $user->save();

        return response()->json($user);
    }

    /**
     * POST /api/change-password — verify current password, set a new one.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'new_password' => ['required', 'string', 'min:8'],
        ]);

        $user = $request->user();

        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->password = Hash::make($data['new_password']);
        $user->save();

        return response()->json(['message' => 'Password updated.']);
    }

    /**
     * GET /api/team — list users in the caller's tenant.
     */
    public function teamIndex(Request $request): JsonResponse
    {
        $tenant_id = $request->user()->tenant_id;

        $users = User::where('tenant_id', $tenant_id)
            ->select(['id', 'name', 'email', 'is_ceo', 'active', 'role_id'])
            ->orderBy('name')
            ->get();

        return response()->json($users);
    }

    /**
     * POST /api/team — CEO-only: create a member in the same tenant.
     */
    public function teamStore(Request $request): JsonResponse
    {
        $caller = $request->user();

        if (! $caller->is_ceo) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role_id' => ['nullable', 'string', 'exists:roles,id'],
        ]);

        $user = User::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $caller->tenant_id,
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'role_id' => $data['role_id'] ?? null,
            'is_ceo' => false,
            'active' => true,
        ]);

        return response()->json($user, 201);
    }

    /**
     * PATCH /api/team/{id} — CEO-only: toggle active or set role_id.
     * Target user must belong to the caller's tenant.
     */
    public function teamUpdate(Request $request, string $id): JsonResponse
    {
        $caller = $request->user();

        if (! $caller->is_ceo) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $user = User::where('tenant_id', $caller->tenant_id)->where('id', $id)->first();

        if (! $user) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $data = $request->validate([
            'active' => ['sometimes', 'boolean'],
            'role_id' => ['sometimes', 'nullable', 'string', 'exists:roles,id'],
        ]);

        if (array_key_exists('active', $data)) {
            $user->active = $data['active'];
        }
        if (array_key_exists('role_id', $data)) {
            $user->role_id = $data['role_id'];
        }
        $user->save();

        return response()->json($user);
    }

    /**
     * GET /api/roles — list roles for the caller's tenant.
     */
    public function rolesIndex(Request $request): JsonResponse
    {
        $roles = Role::where('tenant_id', $request->user()->tenant_id)
            ->orderBy('name')
            ->get();

        return response()->json($roles);
    }

    /**
     * POST /api/roles — create a role (name + permissions JSON) for the tenant.
     */
    public function rolesStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'permissions' => ['nullable'],
        ]);

        $permissions = $data['permissions'] ?? [];
        if (! is_string($permissions)) {
            $permissions = json_encode($permissions);
        }

        $role = Role::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $request->user()->tenant_id,
            'name' => $data['name'],
            'permissions' => $permissions,
        ]);

        return response()->json($role, 201);
    }

    /**
     * POST /api/2fa/begin — generate a new TOTP secret + otpauth URI for the user to add to an authenticator app.
     * Not yet enabled until confirmed via /api/2fa/confirm.
     */
    public function twoFactorBegin(Request $request): JsonResponse
    {
        $user = $request->user();

        $secret = Totp::generateSecret();
        $uri = Totp::otpauthUri($secret, $user->email, 'Orbit');

        // Stash the pending secret; not marked enabled until confirmed.
        $user->two_factor_secret = $secret;
        $user->two_factor_enabled = false;
        $user->save();

        return response()->json([
            'secret' => $secret,
            'otpauth_uri' => $uri,
        ]);
    }

    /**
     * POST /api/2fa/confirm — verify a code against the pending secret, then enable 2FA.
     */
    public function twoFactorConfirm(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (! $user->two_factor_secret || ! Totp::verify($user->two_factor_secret, $data['code'])) {
            throw ValidationException::withMessages([
                'code' => ['The provided code is invalid.'],
            ]);
        }

        $user->two_factor_enabled = true;
        $user->save();

        return response()->json(['message' => 'Two-factor authentication enabled.']);
    }

    /**
     * POST /api/2fa/disable — verify password, then clear 2FA secret/state.
     */
    public function twoFactorDisable(Request $request): JsonResponse
    {
        $data = $request->validate([
            'password' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'password' => ['The provided password is incorrect.'],
            ]);
        }

        $user->two_factor_enabled = false;
        $user->two_factor_secret = null;
        $user->save();

        return response()->json(['message' => 'Two-factor authentication disabled.']);
    }
}
