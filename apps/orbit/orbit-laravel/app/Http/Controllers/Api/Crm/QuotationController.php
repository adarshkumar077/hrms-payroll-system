<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Quotation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class QuotationController extends Controller
{
    /**
     * GET /api/crm/quotations — list quotations for the authenticated tenant.
     */
    public function index(Request $request): JsonResponse
    {
        $tenant_id = auth()->user()->tenant_id;

        $query = Quotation::forTenant($tenant_id);

        // Search across number
        if ($request->has('q') && $q = $request->get('q')) {
            $query->where('number', 'like', "%{$q}%");
        }

        // Filter by status
        if ($request->has('status') && $status = $request->get('status')) {
            $query->where('status', $status);
        }

        // Filter by opportunity_id if provided
        if ($request->has('opportunity_id') && $opportunity_id = $request->get('opportunity_id')) {
            $query->where('opportunity_id', $opportunity_id);
        }

        // Pagination
        $per_page = $request->get('per_page', 15);
        $quotations = $query->paginate($per_page);

        return response()->json($quotations);
    }

    /**
     * POST /api/crm/quotations — create a new quotation.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'number' => ['required', 'string', 'max:50'],
            'opportunity_id' => ['required', 'string'],
            'status' => ['nullable', 'string', 'max:50'],
            'subtotal' => ['nullable', 'numeric', 'min:0'],
            'tax_total' => ['nullable', 'numeric', 'min:0'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'grand_total' => ['nullable', 'numeric', 'min:0'],
        ]);

        $quotation = Quotation::create([
            'id' => Str::uuid(),
            'tenant_id' => auth()->user()->tenant_id,
            ...$data,
        ]);

        return response()->json($quotation, 201);
    }

    /**
     * GET /api/crm/quotations/{id} — get a quotation.
     */
    public function show(string $id): JsonResponse
    {
        $quotation = Quotation::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        return response()->json($quotation);
    }

    /**
     * PUT /api/crm/quotations/{id} — update a quotation.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $quotation = Quotation::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $data = $request->validate([
            'number' => ['sometimes', 'string', 'max:50'],
            'opportunity_id' => ['sometimes', 'string'],
            'status' => ['nullable', 'string', 'max:50'],
            'subtotal' => ['nullable', 'numeric', 'min:0'],
            'tax_total' => ['nullable', 'numeric', 'min:0'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'grand_total' => ['nullable', 'numeric', 'min:0'],
        ]);

        $quotation->update($data);
        return response()->json($quotation);
    }

    /**
     * DELETE /api/crm/quotations/{id} — delete a quotation.
     */
    public function destroy(string $id): JsonResponse
    {
        $quotation = Quotation::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        $quotation->delete();
        return response()->json(['message' => 'Quotation deleted.']);
    }
}
