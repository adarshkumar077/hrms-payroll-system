<?php

namespace App\Http\Controllers\Api\Crm;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ContactController extends Controller
{
    /**
     * GET /api/crm/contacts — list contacts for the authenticated tenant.
     */
    public function index(Request $request): JsonResponse
    {
        $tenant_id = auth()->user()->tenant_id;

        $query = Contact::forTenant($tenant_id);

        // Search across name, email, phone
        if ($request->has('q') && $q = $request->get('q')) {
            $query->where(function ($subquery) use ($q) {
                $subquery->where('name', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%")
                    ->orWhere('title', 'like', "%{$q}%");
            });
        }

        // Filter by account_id if provided
        if ($request->has('account_id') && $account_id = $request->get('account_id')) {
            $query->where('account_id', $account_id);
        }

        // Pagination
        $per_page = $request->get('per_page', 15);
        $contacts = $query->paginate($per_page);

        return response()->json($contacts);
    }

    /**
     * POST /api/crm/contacts — create a new contact.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'account_id' => ['required', 'string'],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:20'],
            'title' => ['nullable', 'string', 'max:100'],
        ]);

        $contact = Contact::create([
            'id' => Str::uuid(),
            'tenant_id' => auth()->user()->tenant_id,
            ...$data,
        ]);

        return response()->json($contact, 201);
    }

    /**
     * GET /api/crm/contacts/{id} — get a contact.
     */
    public function show(string $id): JsonResponse
    {
        $contact = Contact::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        return response()->json($contact);
    }

    /**
     * PUT /api/crm/contacts/{id} — update a contact.
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $contact = Contact::forTenant(auth()->user()->tenant_id)->findOrFail($id);

        $data = $request->validate([
            'account_id' => ['sometimes', 'string'],
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:20'],
            'title' => ['nullable', 'string', 'max:100'],
        ]);

        $contact->update($data);
        return response()->json($contact);
    }

    /**
     * DELETE /api/crm/contacts/{id} — delete a contact.
     */
    public function destroy(string $id): JsonResponse
    {
        $contact = Contact::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        $contact->delete();
        return response()->json(['message' => 'Contact deleted.']);
    }
}
