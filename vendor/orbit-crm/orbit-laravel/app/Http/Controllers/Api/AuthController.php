<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Totp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * POST /api/auth/signup — creates a Tenant + CEO User, returns a Sanctum token.
     */
    public function signup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'org' => ['required', 'string', 'max:255'],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $tenant = Tenant::create([
            'name' => $data['org'],
        ]);

        $user = User::create([
            'tenant_id' => $tenant->id,
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'is_ceo' => true,
            'email_verified' => true,
        ]);

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user,
            'tenant' => $tenant,
        ], 201);
    }

    /**
     * POST /api/auth/login — validates credentials, returns a token.
     */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! $user->active || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        // Enforce 2FA in the same step: a valid TOTP code is required before any
        // token is issued (no intermediate token that could bypass the guard).
        if ($user->two_factor_enabled) {
            $code = (string) $request->input('code', '');
            if ($code === '' || ! Totp::verify((string) $user->two_factor_secret, $code)) {
                return response()->json([
                    'requires_2fa' => true,
                    'message' => $code === '' ? 'Two-factor code required.' : 'Invalid two-factor code.',
                ], 422);
            }
        }

        $token = $user->createToken('api')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $user,
        ]);
    }

    /**
     * POST /api/auth/logout — revokes the current token.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    /**
     * GET /api/me — returns the authenticated user.
     */
    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user());
    }
}
