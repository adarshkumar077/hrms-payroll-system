<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_signup_creates_tenant_and_ceo_user_and_returns_token(): void
    {
        $response = $this->postJson('/api/auth/signup', [
            'org' => 'Acme Inc',
            'name' => 'Alice CEO',
            'email' => 'alice@acme.test',
            'password' => 'password123',
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure(['token', 'user', 'tenant'])
            ->assertJsonPath('user.email', 'alice@acme.test')
            ->assertJsonPath('user.is_ceo', true)
            ->assertJsonPath('tenant.name', 'Acme Inc');

        $this->assertNotEmpty($response->json('token'));

        $this->assertDatabaseHas('tenants', ['name' => 'Acme Inc']);

        $user = User::where('email', 'alice@acme.test')->first();
        $this->assertNotNull($user);
        $this->assertTrue($user->is_ceo);
        $this->assertEquals($user->tenant_id, Tenant::where('name', 'Acme Inc')->first()->id);
    }

    public function test_signup_rejects_duplicate_email(): void
    {
        $this->postJson('/api/auth/signup', [
            'org' => 'Acme Inc',
            'name' => 'Alice CEO',
            'email' => 'dup@acme.test',
            'password' => 'password123',
        ])->assertStatus(201);

        $this->postJson('/api/auth/signup', [
            'org' => 'Other Inc',
            'name' => 'Bob',
            'email' => 'dup@acme.test',
            'password' => 'password123',
        ])->assertStatus(422);
    }

    public function test_login_succeeds_with_correct_credentials(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create([
            'email' => 'login@acme.test',
            'password' => bcrypt('secret123'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'login@acme.test',
            'password' => 'secret123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.email', 'login@acme.test');
    }

    public function test_login_fails_with_wrong_password(): void
    {
        $tenant = Tenant::factory()->create();
        User::factory()->for($tenant)->create([
            'email' => 'wrongpw@acme.test',
            'password' => bcrypt('correct-password'),
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'wrongpw@acme.test',
            'password' => 'incorrect-password',
        ]);

        $response->assertStatus(422);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/me')->assertStatus(401);
    }

    public function test_me_returns_authenticated_user_with_valid_token(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create([
            'email' => 'me@acme.test',
        ]);

        $token = $user->createToken('api')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer $token")
            ->getJson('/api/me');

        $response->assertStatus(200)
            ->assertJsonPath('email', 'me@acme.test');
    }

    public function test_logout_revokes_the_current_token(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create();

        $tokenResult = $user->createToken('api');
        $token = $tokenResult->plainTextToken;

        $this->assertDatabaseHas('personal_access_tokens', ['id' => $tokenResult->accessToken->id]);

        $this->withHeader('Authorization', "Bearer $token")
            ->postJson('/api/auth/logout')
            ->assertStatus(200);

        // The token row itself should be gone (Sanctum's RequestGuard caches the resolved
        // user for the lifetime of the test process, so re-probing with the same token via
        // a second in-process request is not a reliable signal here — asserting the token
        // row is deleted is the correct check).
        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $tokenResult->accessToken->id]);
    }

    public function test_two_tenants_users_are_distinct(): void
    {
        $tenantA = Tenant::factory()->create(['name' => 'Tenant A']);
        $tenantB = Tenant::factory()->create(['name' => 'Tenant B']);

        $userA = User::factory()->for($tenantA)->create(['email' => 'user@tenanta.test']);
        $userB = User::factory()->for($tenantB)->create(['email' => 'user@tenantb.test']);

        $this->assertNotEquals($userA->tenant_id, $userB->tenant_id);
        $this->assertEquals($tenantA->id, $userA->tenant_id);
        $this->assertEquals($tenantB->id, $userB->tenant_id);

        $this->assertDatabaseCount('tenants', 2);
    }
}
