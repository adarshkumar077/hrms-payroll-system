<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Account;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class AccountController extends Controller
{
    /**
     * GET /api/crm/accounts — list accounts for the authenticated tenant.
     */
    public function index(Request $request): JsonResponse
    {
        $tenant_id = auth()->user()->tenant_id;

        $query = Account::forTenant($tenant_id);

        // Search across name, email, phone
        if ($request->has('q') && $q = $request->get('q')) {
            $query->where(function ($subquery) use ($q) {
                $subquery->where('name', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%")
                    ->orWhere('gstin', 'like', "%{$q}%");
            });
        }

        // Pagination
        $per_page = $request->get('per_page', 15);
        $accounts = $query->paginate($per_page);

        return response()->json($accounts);
    }

    /**
     * POST /api/crm/accounts — create a new account.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'industry' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:255'],
            'gstin' => ['nullable', 'string', 'max:15'],
            'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string', 'max:100'],
            'state' => ['nullable', 'string', 'max:100'],
        ]);

        $account = Account::create([
            'id' => Str::uuid(),
            'tenant_id' => auth()->user()->tenant_id,
            ...$data,
        ]);

        return response()->json($account, 201);
    }

    /**
     * GET /api/crm/accounts/{id} — get an account.
     */
    public function show(string $id): JsonResponse
    {
        $account = Account::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        return response()->json($account);
    }

    /**
     * PUT /api/crm/accounts/{id} — update an account.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $account = Account::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'industry' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:20'],
            'email' => ['nullable', 'email', 'max:255'],
            'gstin' => ['nullable', 'string', 'max:15'],
            'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string', 'max:100'],
            'state' => ['nullable', 'string', 'max:100'],
        ]);

        $account->update($data);
        return response()->json($account);
    }

    /**
     * DELETE /api/crm/accounts/{id} — delete an account.
     */
    public function destroy(string $id): JsonResponse
    {
        $account = Account::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        $account->delete();
        return response()->json(['message' => 'Account deleted.']);
    }
}
