<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ActivityController extends Controller
{
    /**
     * GET /api/crm/activities — list activities for the authenticated tenant.
     */
    public function index(Request $request): JsonResponse
    {
        $tenant_id = auth()->user()->tenant_id;

        $query = Activity::forTenant($tenant_id);

        // Search across subject, summary
        if ($request->has('q') && $q = $request->get('q')) {
            $query->where(function ($subquery) use ($q) {
                $subquery->where('subject', 'like', "%{$q}%")
                    ->orWhere('summary', 'like', "%{$q}%");
            });
        }

        // Filter by type
        if ($request->has('type') && $type = $request->get('type')) {
            $query->where('type', $type);
        }

        // Filter by done status
        if ($request->has('done')) {
            $done = $request->get('done') === 'true' || $request->get('done') === '1';
            $query->where('done', $done);
        }

        // Pagination
        $per_page = $request->get('per_page', 15);
        $activities = $query->paginate($per_page);

        return response()->json($activities);
    }

    /**
     * POST /api/crm/activities — create a new activity.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', 'max:50'],
            'subject' => ['required', 'string', 'max:255'],
            'related_to' => ['nullable', 'string', 'max:255'],
            'due_date' => ['nullable', 'date'],
            'done' => ['nullable', 'boolean'],
            'summary' => ['nullable', 'string'],
            'owner_id' => ['nullable', 'string'],
        ]);

        $activity = Activity::create([
            'id' => Str::uuid(),
            'tenant_id' => auth()->user()->tenant_id,
            ...$data,
        ]);

        return response()->json($activity, 201);
    }

    /**
     * GET /api/crm/activities/{id} — get an activity.
     */
    public function show(string $id): JsonResponse
    {
        $activity = Activity::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        return response()->json($activity);
    }

    /**
     * PUT /api/crm/activities/{id} — update an activity.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $activity = Activity::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $data = $request->validate([
            'type' => ['sometimes', 'string', 'max:50'],
            'subject' => ['sometimes', 'string', 'max:255'],
            'related_to' => ['nullable', 'string', 'max:255'],
            'due_date' => ['nullable', 'date'],
            'done' => ['nullable', 'boolean'],
            'summary' => ['nullable', 'string'],
            'owner_id' => ['nullable', 'string'],
        ]);

        $activity->update($data);
        return response()->json($activity);
    }

    /**
     * DELETE /api/crm/activities/{id} — delete an activity.
     */
    public function destroy(string $id): JsonResponse
    {
        $activity = Activity::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        $activity->delete();
        return response()->json(['message' => 'Activity deleted.']);
    }
}
