<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Opportunity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class OpportunityController extends Controller
{
    const STAGE_FLOW = ['Qualification', 'Proposal', 'Negotiation', 'ClosedWon'];
    const STAGE_PROB = [
        'Qualification' => 20,
        'Proposal' => 50,
        'Negotiation' => 75,
        'ClosedWon' => 100,
        'ClosedLost' => 0,
    ];

    /**
     * GET /api/crm/opportunities — list opportunities for the authenticated tenant.
     */
    public function index(Request $request): JsonResponse
    {
        $tenant_id = auth()->user()->tenant_id;

        $query = Opportunity::forTenant($tenant_id);

        // Search across name
        if ($request->has('q') && $q = $request->get('q')) {
            $query->where('name', 'like', "%{$q}%");
        }

        // Filter by stage
        if ($request->has('stage') && $stage = $request->get('stage')) {
            $query->where('stage', $stage);
        }

        // Pagination
        $per_page = $request->get('per_page', 15);
        $opportunities = $query->paginate($per_page);

        return response()->json($opportunities);
    }

    /**
     * POST /api/crm/opportunities — create a new opportunity.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'account_id' => ['required', 'string'],
            'name' => ['required', 'string', 'max:255'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'stage' => ['nullable', 'string', 'max:50'],
            'probability' => ['nullable', 'integer', 'min:0', 'max:100'],
            'close_date' => ['nullable', 'date'],
            'owner_id' => ['nullable', 'string'],
        ]);

        $opportunity = Opportunity::create([
            'id' => Str::uuid(),
            'tenant_id' => auth()->user()->tenant_id,
            ...$data,
        ]);

        return response()->json($opportunity, 201);
    }

    /**
     * GET /api/crm/opportunities/{id} — get an opportunity.
     */
    public function show(string $id): JsonResponse
    {
        $opportunity = Opportunity::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        return response()->json($opportunity);
    }

    /**
     * PUT /api/crm/opportunities/{id} — update an opportunity.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $opportunity = Opportunity::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $data = $request->validate([
            'account_id' => ['sometimes', 'string'],
            'name' => ['sometimes', 'string', 'max:255'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'stage' => ['nullable', 'string', 'max:50'],
            'probability' => ['nullable', 'integer', 'min:0', 'max:100'],
            'close_date' => ['nullable', 'date'],
            'owner_id' => ['nullable', 'string'],
        ]);

        $opportunity->update($data);
        return response()->json($opportunity);
    }

    /**
     * DELETE /api/crm/opportunities/{id} — delete an opportunity.
     */
    public function destroy(string $id): JsonResponse
    {
        $opportunity = Opportunity::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        $opportunity->delete();
        return response()->json(['message' => 'Opportunity deleted.']);
    }

    /**
     * POST /api/crm/opportunities/{id}/advance — advance opportunity to the next stage.
     */
    public function advance(string $id): JsonResponse
    {
        $opportunity = Opportunity::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $idx = array_search($opportunity->stage, self::STAGE_FLOW);
        if ($idx === false || $idx >= count(self::STAGE_FLOW) - 1) {
            return response()->json(['error' => 'Cannot advance from current stage.'], 400);
        }

        $next_stage = self::STAGE_FLOW[$idx + 1];
        $next_prob = self::STAGE_PROB[$next_stage] ?? $opportunity->probability;

        $opportunity->update([
            'stage' => $next_stage,
            'probability' => $next_prob,
        ]);

        return response()->json($opportunity);
    }
}
