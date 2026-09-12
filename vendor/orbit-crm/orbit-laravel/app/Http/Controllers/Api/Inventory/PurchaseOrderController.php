<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Controller;
use App\Models\PurchaseOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PurchaseOrderController extends Controller
{
    /**
     * GET /api/inventory/purchase-orders — list purchase orders for the authenticated tenant.
     */
    public function index(Request $request): JsonResponse
    {
        $tenant_id = auth()->user()->tenant_id;

        $query = PurchaseOrder::forTenant($tenant_id);

        // Filter by status
        if ($request->has('status') && $status = $request->get('status')) {
            $query->where('status', $status);
        }

        // Pagination
        $per_page = $request->get('per_page', 15);
        $pos = $query->paginate($per_page);

        return response()->json($pos);
    }

    /**
     * POST /api/inventory/purchase-orders — create a new purchase order.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'number' => ['required', 'string', 'max:255'],
            'vendor' => ['required', 'string', 'max:255'],
            'total' => ['nullable', 'numeric', 'min:0'],
            'status' => ['nullable', 'string', 'max:50'],
        ]);

        $po = PurchaseOrder::create([
            'id' => Str::uuid(),
            'tenant_id' => auth()->user()->tenant_id,
            'status' => $data['status'] ?? 'Draft',
            ...$data,
        ]);

        return response()->json($po, 201);
    }

    /**
     * GET /api/inventory/purchase-orders/{id} — get a purchase order.
     */
    public function show(string $id): JsonResponse
    {
        $po = PurchaseOrder::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        return response()->json($po);
    }

    /**
     * POST /api/inventory/purchase-orders/{id}/receive — receive a purchase order (Draft/Sent → Received).
     */
    public function receive(Request $request, string $id): JsonResponse
    {
        $po = PurchaseOrder::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        // Only allow receiving from Draft or Sent status
        if (!in_array($po->status, ['Draft', 'Sent'])) {
            return response()->json([
                'message' => "Cannot receive purchase order with status '{$po->status}'.",
            ], 422);
        }

        $po->update([
            'status' => 'Received',
        ]);

        return response()->json([
            'message' => 'Purchase order received.',
            'po' => $po,
        ]);
    }
}
