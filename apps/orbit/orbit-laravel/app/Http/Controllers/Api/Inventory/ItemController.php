<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\StockMove;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ItemController extends Controller
{
    /**
     * GET /api/inventory/items — list items for the authenticated tenant, support search.
     */
    public function index(Request $request): JsonResponse
    {
        $tenant_id = auth()->user()->tenant_id;

        $query = Item::forTenant($tenant_id);

        // Search across name, sku, hsn
        if ($request->has('q') && $q = $request->get('q')) {
            $query->where(function ($subquery) use ($q) {
                $subquery->where('name', 'like', "%{$q}%")
                    ->orWhere('sku', 'like', "%{$q}%")
                    ->orWhere('hsn', 'like', "%{$q}%");
            });
        }

        // Pagination
        $per_page = $request->get('per_page', 15);
        $items = $query->paginate($per_page);

        return response()->json($items);
    }

    /**
     * POST /api/inventory/items — create a new item.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'sku' => ['nullable', 'string', 'max:255'],
            'hsn' => ['nullable', 'string', 'max:255'],
            'uom' => ['required', 'string', 'max:50'],
            'on_hand' => ['nullable', 'integer', 'min:0'],
            'reorder_level' => ['nullable', 'integer', 'min:0'],
            'cost_price' => ['nullable', 'numeric', 'min:0'],
        ]);

        $item = Item::create([
            'id' => Str::uuid(),
            'tenant_id' => auth()->user()->tenant_id,
            'on_hand' => $data['on_hand'] ?? 0,
            'reorder_level' => $data['reorder_level'] ?? 0,
            'cost_price' => $data['cost_price'] ?? 0,
            ...$data,
        ]);

        return response()->json($item, 201);
    }

    /**
     * GET /api/inventory/items/{id} — get an item.
     */
    public function show(string $id): JsonResponse
    {
        $item = Item::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        return response()->json($item);
    }

    /**
     * PUT /api/inventory/items/{id} — update an item.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $item = Item::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'sku' => ['nullable', 'string', 'max:255'],
            'hsn' => ['nullable', 'string', 'max:255'],
            'uom' => ['sometimes', 'string', 'max:50'],
            'reorder_level' => ['nullable', 'integer', 'min:0'],
            'cost_price' => ['nullable', 'numeric', 'min:0'],
        ]);

        $item->update($data);
        return response()->json($item);
    }

    /**
     * DELETE /api/inventory/items/{id} — delete an item.
     */
    public function destroy(string $id): JsonResponse
    {
        $item = Item::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        $item->delete();
        return response()->json(['message' => 'Item deleted.']);
    }

    /**
     * POST /api/inventory/items/{id}/adjust-stock — adjust stock (create a StockMove and update on_hand).
     */
    public function adjustStock(Request $request, string $id): JsonResponse
    {
        $item = Item::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $data = $request->validate([
            'qty' => ['required', 'integer'],
            'warehouse_id' => ['nullable', 'string'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        // Create a StockMove record
        $move = StockMove::create([
            'id' => Str::uuid(),
            'tenant_id' => auth()->user()->tenant_id,
            'item_id' => $item->id,
            'warehouse_id' => $data['warehouse_id'] ?? null,
            'qty' => $data['qty'],
            'type' => 'Adjustment',
            'ref' => $data['reason'] ?? null,
        ]);

        // Update item on_hand
        $item->update([
            'on_hand' => $item->on_hand + $data['qty'],
        ]);

        return response()->json([
            'message' => 'Stock adjusted.',
            'item' => $item->fresh(),
            'move' => $move,
        ]);
    }
}
