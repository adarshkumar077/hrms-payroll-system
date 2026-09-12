<?php

namespace Tests\Feature\Inventory;

use App\Models\Item;
use App\Models\StockMove;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ItemApiTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private User $user;
    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        // Create a tenant and user
        $this->tenant = Tenant::factory()->create();
        $this->user = User::factory()->for($this->tenant)->create([
            'email' => 'test@inventory.test',
        ]);
        $this->token = $this->user->createToken('api')->plainTextToken;
    }

    public function test_authenticated_user_can_create_an_item(): void
    {
        $response = $this->withHeader('Authorization', "Bearer {$this->token}")
            ->postJson('/api/inventory/items', [
                'name' => 'Test Item',
                'sku' => 'SKU-001',
                'hsn' => 'HSN-001',
                'uom' => 'pieces',
                'on_hand' => 100,
                'reorder_level' => 10,
                'cost_price' => 50.00,
            ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'id',
                'tenant_id',
                'name',
                'sku',
                'hsn',
                'uom',
                'on_hand',
                'reorder_level',
                'cost_price',
            ])
            ->assertJsonPath('name', 'Test Item')
            ->assertJsonPath('sku', 'SKU-001')
            ->assertJsonPath('on_hand', 100);

        $this->assertDatabaseHas('items', [
            'name' => 'Test Item',
            'tenant_id' => $this->tenant->id,
        ]);
    }

    public function test_authenticated_user_can_list_items(): void
    {
        // Create items for this tenant
        Item::create([
            'id' => 'item-1',
            'tenant_id' => $this->tenant->id,
            'name' => 'Item A',
            'sku' => 'SKU-A',
            'uom' => 'pieces',
            'on_hand' => 10,
            'reorder_level' => 5,
            'cost_price' => 100,
        ]);

        Item::create([
            'id' => 'item-2',
            'tenant_id' => $this->tenant->id,
            'name' => 'Item B',
            'sku' => 'SKU-B',
            'uom' => 'kg',
            'on_hand' => 20,
            'reorder_level' => 10,
            'cost_price' => 200,
        ]);

        $response = $this->withHeader('Authorization', "Bearer {$this->token}")
            ->getJson('/api/inventory/items');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'name', 'sku', 'uom', 'on_hand'],
                ],
            ])
            ->assertJsonCount(2, 'data');
    }

    public function test_search_items_by_name(): void
    {
        Item::create([
            'id' => 'item-1',
            'tenant_id' => $this->tenant->id,
            'name' => 'Widget',
            'sku' => 'SKU-001',
            'uom' => 'pieces',
            'on_hand' => 10,
            'reorder_level' => 5,
            'cost_price' => 50,
        ]);

        Item::create([
            'id' => 'item-2',
            'tenant_id' => $this->tenant->id,
            'name' => 'Gadget',
            'sku' => 'SKU-002',
            'uom' => 'pieces',
            'on_hand' => 20,
            'reorder_level' => 10,
            'cost_price' => 100,
        ]);

        $response = $this->withHeader('Authorization', "Bearer {$this->token}")
            ->getJson('/api/inventory/items?q=Widget');

        $response->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Widget');
    }

    public function test_authenticated_user_can_adjust_stock(): void
    {
        $item = Item::create([
            'id' => 'item-test',
            'tenant_id' => $this->tenant->id,
            'name' => 'Test Item',
            'sku' => 'SKU-001',
            'uom' => 'pieces',
            'on_hand' => 100,
            'reorder_level' => 10,
            'cost_price' => 50,
        ]);

        $response = $this->withHeader('Authorization', "Bearer {$this->token}")
            ->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
                'qty' => 50,
                'reason' => 'Stock Received',
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'message',
                'item' => ['id', 'name', 'on_hand'],
                'move' => ['id', 'qty', 'type'],
            ])
            ->assertJsonPath('message', 'Stock adjusted.')
            ->assertJsonPath('item.on_hand', 150);

        // Verify StockMove was created
        $this->assertDatabaseHas('stock_moves', [
            'item_id' => $item->id,
            'tenant_id' => $this->tenant->id,
            'qty' => 50,
            'type' => 'Adjustment',
            'ref' => 'Stock Received',
        ]);

        // Verify item on_hand was updated
        $this->assertEquals(150, $item->fresh()->on_hand);
    }

    public function test_negative_stock_adjustment(): void
    {
        $item = Item::create([
            'id' => 'item-test',
            'tenant_id' => $this->tenant->id,
            'name' => 'Test Item',
            'sku' => 'SKU-001',
            'uom' => 'pieces',
            'on_hand' => 100,
            'reorder_level' => 10,
            'cost_price' => 50,
        ]);

        $response = $this->withHeader('Authorization', "Bearer {$this->token}")
            ->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
                'qty' => -25,
                'reason' => 'Damage',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('item.on_hand', 75);

        $this->assertDatabaseHas('stock_moves', [
            'item_id' => $item->id,
            'qty' => -25,
            'ref' => 'Damage',
        ]);
    }

    public function test_tenant_isolation_items_not_accessible_across_tenants(): void
    {
        // Create another tenant and user
        $otherTenant = Tenant::factory()->create();
        $otherUser = User::factory()->for($otherTenant)->create();
        $otherToken = $otherUser->createToken('api')->plainTextToken;

        // Create item in the first tenant
        $item = Item::create([
            'id' => 'item-tenant-1',
            'tenant_id' => $this->tenant->id,
            'name' => 'Tenant 1 Item',
            'sku' => 'SKU-T1',
            'uom' => 'pieces',
            'on_hand' => 50,
            'reorder_level' => 5,
            'cost_price' => 100,
        ]);

        // Try to access the item as the other tenant's user
        $response = $this->withHeader('Authorization', "Bearer {$otherToken}")
            ->getJson("/api/inventory/items/{$item->id}");

        // Should fail with 404 (not found)
        $response->assertStatus(404);

        // List should only return empty or items from other tenant
        $response = $this->withHeader('Authorization', "Bearer {$otherToken}")
            ->getJson('/api/inventory/items');

        $response->assertStatus(200)
            ->assertJsonCount(0, 'data');
    }

    public function test_stock_moves_are_isolated_by_tenant(): void
    {
        // Create item and stock move in first tenant
        $item = Item::create([
            'id' => 'item-1',
            'tenant_id' => $this->tenant->id,
            'name' => 'Item 1',
            'sku' => 'SKU-1',
            'uom' => 'pieces',
            'on_hand' => 100,
            'reorder_level' => 10,
            'cost_price' => 50,
        ]);

        $move = StockMove::create([
            'id' => 'move-1',
            'tenant_id' => $this->tenant->id,
            'item_id' => $item->id,
            'qty' => 50,
            'type' => 'Adjustment',
            'ref' => 'Test',
        ]);

        // Create another tenant
        $otherTenant = Tenant::factory()->create();
        $otherUser = User::factory()->for($otherTenant)->create();
        $otherToken = $otherUser->createToken('api')->plainTextToken;

        // Try to adjust stock on tenant 1's item as tenant 2 user
        $response = $this->withHeader('Authorization', "Bearer {$otherToken}")
            ->postJson("/api/inventory/items/{$item->id}/adjust-stock", [
                'qty' => 10,
                'reason' => 'Should fail',
            ]);

        // Should fail
        $response->assertStatus(404);

        // The StockMove from tenant 1 should not be accessible
        $this->assertDatabaseHas('stock_moves', [
            'id' => $move->id,
            'tenant_id' => $this->tenant->id,
        ]);

        $this->assertDatabaseMissing('stock_moves', [
            'id' => $move->id,
            'tenant_id' => $otherTenant->id,
        ]);
    }

    public function test_unauthenticated_request_to_inventory_is_rejected(): void
    {
        $response = $this->getJson('/api/inventory/items');

        $response->assertStatus(401);
    }
}
