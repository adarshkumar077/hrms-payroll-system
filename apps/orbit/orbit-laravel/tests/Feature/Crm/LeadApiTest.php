<?php

namespace Tests\Feature\Crm;

use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LeadApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Tenant $tenant;
    private User $otherTenantUser;
    private Tenant $otherTenant;

    protected function setUp(): void
    {
        parent::setUp();

        // Create a tenant and user
        $this->tenant = Tenant::create(['name' => 'Test Org']);
        $this->user = User::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Test User',
            'email' => 'user@test.com',
            'password' => bcrypt('password'),
            'is_ceo' => true,
            'active' => true,
            'email_verified' => true,
        ]);

        // Create another tenant and user (for isolation testing)
        $this->otherTenant = Tenant::create(['name' => 'Other Org']);
        $this->otherTenantUser = User::create([
            'tenant_id' => $this->otherTenant->id,
            'name' => 'Other User',
            'email' => 'other@test.com',
            'password' => bcrypt('password'),
            'is_ceo' => true,
            'active' => true,
            'email_verified' => true,
        ]);
    }

    /**
     * Test: Authenticated user can create a lead for their tenant.
     */
    public function test_authenticated_user_can_create_lead(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson('/api/crm/leads', [
                'name' => 'John Doe',
                'company' => 'Acme Corp',
                'email' => 'john@acme.com',
                'phone' => '9876543210',
                'source' => 'Website',
                'status' => 'New',
            ]);

        $response->assertStatus(201);
        $response->assertJsonStructure([
            'id',
            'tenant_id',
            'name',
            'company',
            'email',
            'phone',
            'source',
            'status',
        ]);
        $this->assertDatabaseHas('leads', [
            'name' => 'John Doe',
            'tenant_id' => $this->tenant->id,
        ]);
    }

    /**
     * Test: Authenticated user can list their tenant's leads.
     */
    public function test_authenticated_user_can_list_leads(): void
    {
        // Create leads for this tenant
        Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'Lead 1',
            'company' => 'Company A',
            'email' => 'lead1@a.com',
            'phone' => '1111111111',
            'source' => 'Website',
            'status' => 'New',
        ]);

        Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'Lead 2',
            'company' => 'Company B',
            'email' => 'lead2@b.com',
            'phone' => '2222222222',
            'source' => 'IndiaMART',
            'status' => 'Contacted',
        ]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/crm/leads');

        $response->assertStatus(200);
        $response->assertJsonCount(2, 'data');
        $this->assertEquals('Lead 1', $response->json('data.0.name'));
        $this->assertEquals('Lead 2', $response->json('data.1.name'));
    }

    /**
     * Test: Search by query parameter (name, company, email, phone).
     */
    public function test_authenticated_user_can_search_leads(): void
    {
        Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'John Doe',
            'company' => 'Acme Corp',
            'email' => 'john@acme.com',
            'phone' => '9876543210',
            'source' => 'Website',
            'status' => 'New',
        ]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/crm/leads?q=John');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $this->assertEquals('John Doe', $response->json('data.0.name'));
    }

    /**
     * Test: Filter by status.
     */
    public function test_authenticated_user_can_filter_leads_by_status(): void
    {
        Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'Lead 1',
            'company' => 'Company A',
            'status' => 'New',
        ]);

        Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'Lead 2',
            'company' => 'Company B',
            'status' => 'Contacted',
        ]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/crm/leads?status=Contacted');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
        $this->assertEquals('Lead 2', $response->json('data.0.name'));
    }

    /**
     * Test: User can get a specific lead.
     */
    public function test_authenticated_user_can_get_lead(): void
    {
        $lead = Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'John Doe',
            'company' => 'Acme Corp',
            'status' => 'New',
        ]);

        $response = $this->actingAs($this->user)
            ->getJson("/api/crm/leads/{$lead->id}");

        $response->assertStatus(200);
        $this->assertEquals('John Doe', $response->json('name'));
    }

    /**
     * Test: User can update a lead.
     */
    public function test_authenticated_user_can_update_lead(): void
    {
        $lead = Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'John Doe',
            'company' => 'Acme Corp',
            'status' => 'New',
        ]);

        $response = $this->actingAs($this->user)
            ->putJson("/api/crm/leads/{$lead->id}", [
                'status' => 'Contacted',
            ]);

        $response->assertStatus(200);
        $this->assertEquals('Contacted', $response->json('status'));
        $this->assertDatabaseHas('leads', [
            'id' => $lead->id,
            'status' => 'Contacted',
        ]);
    }

    /**
     * Test: User can delete a lead.
     */
    public function test_authenticated_user_can_delete_lead(): void
    {
        $lead = Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'John Doe',
            'status' => 'New',
        ]);

        $response = $this->actingAs($this->user)
            ->deleteJson("/api/crm/leads/{$lead->id}");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('leads', ['id' => $lead->id]);
    }

    /**
     * TEST TENANT ISOLATION
     * A user from another tenant cannot see or modify leads from the first tenant.
     */
    public function test_other_tenant_user_cannot_see_leads(): void
    {
        $lead = Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'John Doe',
            'company' => 'Acme Corp',
            'status' => 'New',
        ]);

        // Other tenant user tries to list leads
        $response = $this->actingAs($this->otherTenantUser)
            ->getJson('/api/crm/leads');

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'data');
    }

    /**
     * Test: Other tenant user cannot access another tenant's lead directly.
     */
    public function test_other_tenant_user_cannot_get_lead(): void
    {
        $lead = Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'John Doe',
            'status' => 'New',
        ]);

        // Other tenant user tries to get the lead
        $response = $this->actingAs($this->otherTenantUser)
            ->getJson("/api/crm/leads/{$lead->id}");

        $response->assertStatus(404);
    }

    /**
     * Test: Other tenant user cannot update another tenant's lead.
     */
    public function test_other_tenant_user_cannot_update_lead(): void
    {
        $lead = Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'John Doe',
            'status' => 'New',
        ]);

        // Other tenant user tries to update the lead
        $response = $this->actingAs($this->otherTenantUser)
            ->putJson("/api/crm/leads/{$lead->id}", [
                'status' => 'Contacted',
            ]);

        $response->assertStatus(404);
        // Verify the original lead was not modified
        $this->assertDatabaseHas('leads', [
            'id' => $lead->id,
            'status' => 'New',
        ]);
    }

    /**
     * Test: Other tenant user cannot delete another tenant's lead.
     */
    public function test_other_tenant_user_cannot_delete_lead(): void
    {
        $lead = Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'John Doe',
            'status' => 'New',
        ]);

        // Other tenant user tries to delete the lead
        $response = $this->actingAs($this->otherTenantUser)
            ->deleteJson("/api/crm/leads/{$lead->id}");

        $response->assertStatus(404);
        // Verify the lead still exists
        $this->assertDatabaseHas('leads', ['id' => $lead->id]);
    }

    /**
     * Test: Score action returns the lead.
     */
    public function test_authenticated_user_can_score_lead(): void
    {
        $lead = Lead::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'John Doe',
            'company' => 'Acme Corp',
            'status' => 'New',
        ]);

        $response = $this->actingAs($this->user)
            ->postJson("/api/crm/leads/{$lead->id}/score");

        $response->assertStatus(200);
        $this->assertEquals($lead->id, $response->json('id'));
    }

    /**
     * Test: Unauthenticated user cannot create a lead.
     */
    public function test_unauthenticated_user_cannot_create_lead(): void
    {
        $response = $this->postJson('/api/crm/leads', [
            'name' => 'John Doe',
            'company' => 'Acme Corp',
        ]);

        $response->assertStatus(401);
    }

    /**
     * Test: Unauthenticated user cannot list leads.
     */
    public function test_unauthenticated_user_cannot_list_leads(): void
    {
        $response = $this->getJson('/api/crm/leads');

        $response->assertStatus(401);
    }
}
