<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LeadController extends Controller
{
    /**
     * GET /api/crm/leads — list leads for the authenticated tenant, support search and filtering.
     */
    public function index(Request $request): JsonResponse
    {
        $tenant_id = auth()->user()->tenant_id;

        $query = Lead::forTenant($tenant_id);

        // Search across name, company, email, phone
        if ($request->has('q') && $q = $request->get('q')) {
            $query->where(function ($subquery) use ($q) {
                $subquery->where('name', 'like', "%{$q}%")
                    ->orWhere('company', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%");
            });
        }

        // Filter by status
        if ($request->has('status') && $status = $request->get('status')) {
            $query->where('status', $status);
        }

        // Pagination
        $per_page = $request->get('per_page', 15);
        $leads = $query->paginate($per_page);

        return response()->json($leads);
    }

    /**
     * POST /api/crm/leads — create a new lead.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:20'],
            'source' => ['nullable', 'string', 'max:50'],
            'status' => ['nullable', 'string', 'max:50'],
            'score' => ['nullable', 'integer', 'min:0', 'max:100'],
            'score_reason' => ['nullable', 'string'],
            'owner_id' => ['nullable', 'string'],
        ]);

        $lead = Lead::create([
            'id' => Str::uuid(),
            'tenant_id' => auth()->user()->tenant_id,
            ...$data,
        ]);

        return response()->json($lead, 201);
    }

    /**
     * GET /api/crm/leads/{id} — get a lead.
     */
    public function show(string $id): JsonResponse
    {
        $lead = Lead::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        return response()->json($lead);
    }

    /**
     * PUT /api/crm/leads/{id} — update a lead.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $lead = Lead::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:20'],
            'source' => ['nullable', 'string', 'max:50'],
            'status' => ['nullable', 'string', 'max:50'],
            'score' => ['nullable', 'integer', 'min:0', 'max:100'],
            'score_reason' => ['nullable', 'string'],
            'owner_id' => ['nullable', 'string'],
        ]);

        $lead->update($data);
        return response()->json($lead);
    }

    /**
     * DELETE /api/crm/leads/{id} — delete a lead.
     */
    public function destroy(string $id): JsonResponse
    {
        $lead = Lead::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        $lead->delete();
        return response()->json(['message' => 'Lead deleted.']);
    }

    /**
     * POST /api/crm/leads/{id}/score — score a lead (AI scoring stub).
     */
    public function score(string $id): JsonResponse
    {
        $lead = Lead::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        // TODO: AiService::scoreLead($lead->name, $lead->company, $lead->source, $lead->email, $lead->phone)
        // For now, return the lead as-is.

        return response()->json($lead);
    }
}
