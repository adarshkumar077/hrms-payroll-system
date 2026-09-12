<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Ticket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class TicketController extends Controller
{
    const STATUSES = ['Open', 'InProgress', 'Resolved', 'Closed'];

    /**
     * GET /api/crm/tickets — list tickets for the authenticated tenant.
     */
    public function index(Request $request): JsonResponse
    {
        $tenant_id = auth()->user()->tenant_id;

        $query = Ticket::forTenant($tenant_id);

        // Search across subject
        if ($request->has('q') && $q = $request->get('q')) {
            $query->where('subject', 'like', "%{$q}%");
        }

        // Filter by status
        if ($request->has('status') && $status = $request->get('status')) {
            $query->where('status', $status);
        }

        // Filter by priority
        if ($request->has('priority') && $priority = $request->get('priority')) {
            $query->where('priority', $priority);
        }

        // Pagination
        $per_page = $request->get('per_page', 15);
        $tickets = $query->paginate($per_page);

        return response()->json($tickets);
    }

    /**
     * POST /api/crm/tickets — create a new ticket.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'account_id' => ['required', 'string'],
            'subject' => ['required', 'string', 'max:255'],
            'priority' => ['nullable', 'string', 'max:50'],
            'status' => ['nullable', 'string', 'max:50'],
            'sla_due_at' => ['nullable', 'date'],
            'owner_id' => ['nullable', 'string'],
        ]);

        $ticket = Ticket::create([
            'id' => Str::uuid(),
            'tenant_id' => auth()->user()->tenant_id,
            ...$data,
        ]);

        return response()->json($ticket, 201);
    }

    /**
     * GET /api/crm/tickets/{id} — get a ticket.
     */
    public function show(string $id): JsonResponse
    {
        $ticket = Ticket::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        return response()->json($ticket);
    }

    /**
     * PUT /api/crm/tickets/{id} — update a ticket.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $ticket = Ticket::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $data = $request->validate([
            'account_id' => ['sometimes', 'string'],
            'subject' => ['sometimes', 'string', 'max:255'],
            'priority' => ['nullable', 'string', 'max:50'],
            'status' => ['nullable', 'string', 'max:50'],
            'sla_due_at' => ['nullable', 'date'],
            'owner_id' => ['nullable', 'string'],
        ]);

        $ticket->update($data);
        return response()->json($ticket);
    }

    /**
     * DELETE /api/crm/tickets/{id} — delete a ticket.
     */
    public function destroy(string $id): JsonResponse
    {
        $ticket = Ticket::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        $ticket->delete();
        return response()->json(['message' => 'Ticket deleted.']);
    }

    /**
     * PATCH /api/crm/tickets/{id}/status — update ticket status.
     */
    public function status(Request $request, string $id): JsonResponse
    {
        $ticket = Ticket::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $data = $request->validate([
            'status' => ['required', 'in:' . implode(',', self::STATUSES)],
        ]);

        if ($ticket->status === $data['status']) {
            return response()->json($ticket);
        }

        $ticket->update(['status' => $data['status']]);
        return response()->json($ticket);
    }
}
