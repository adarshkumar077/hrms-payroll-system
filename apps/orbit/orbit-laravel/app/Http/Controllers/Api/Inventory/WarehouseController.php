<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class WarehouseController extends Controller
{
    /**
     * GET /api/inventory/warehouses — list warehouses for the authenticated tenant.
     */
    public function index(Request $request): JsonResponse
    {
        $tenant_id = auth()->user()->tenant_id;

        $query = Warehouse::forTenant($tenant_id);

        // Pagination
        $per_page = $request->get('per_page', 15);
        $warehouses = $query->paginate($per_page);

        return response()->json($warehouses);
    }

    /**
     * POST /api/inventory/warehouses — create a new warehouse.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'location' => ['nullable', 'string', 'max:255'],
        ]);

        $warehouse = Warehouse::create([
            'id' => Str::uuid(),
            'tenant_id' => auth()->user()->tenant_id,
            ...$data,
        ]);

        return response()->json($warehouse, 201);
    }

    /**
     * GET /api/inventory/warehouses/{id} — get a warehouse.
     */
    public function show(string $id): JsonResponse
    {
        $warehouse = Warehouse::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        return response()->json($warehouse);
    }

    /**
     * PUT /api/inventory/warehouses/{id} — update a warehouse.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $warehouse = Warehouse::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'location' => ['nullable', 'string', 'max:255'],
        ]);

        $warehouse->update($data);
        return response()->json($warehouse);
    }

    /**
     * DELETE /api/inventory/warehouses/{id} — delete a warehouse.
     */
    public function destroy(string $id): JsonResponse
    {
        $warehouse = Warehouse::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        $warehouse->delete();
        return response()->json(['message' => 'Warehouse deleted.']);
    }
}
