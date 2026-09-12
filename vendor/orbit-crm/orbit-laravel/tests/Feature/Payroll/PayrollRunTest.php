<?php

namespace Tests\Feature\Payroll;

use App\Models\Employee;
use App\Models\Role;
use App\Models\SalaryStructure;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Compliance\PayrollService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * End-to-end payroll run test: numbers produced by the API must match
 * PayrollService::computePayslip() exactly (the ported statutory engine),
 * and the Draft -> Locked -> Paid transitions must be enforced.
 */
class PayrollRunTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private array $structures = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::factory()->create();

        // Two employees with distinct, deliberately different salary structures
        // so PF-ceiling and ESI-threshold branches are both exercised.
        // NB: the ESI wage threshold is ₹21,000 — the second employee must be
        // BELOW it (gross 20000) for any ESI to actually be computed.
        $this->structures[] = $this->makeEmployeeWithStructure(gross: 50000, basic: 25000); // above ESI threshold → no ESI
        $this->structures[] = $this->makeEmployeeWithStructure(gross: 20000, basic: 10000); // below ESI threshold → ESI applies
    }

    private function makeEmployeeWithStructure(float $gross, float $basic): SalaryStructure
    {
        $employee = Employee::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'code' => 'EMP'.random_int(1000, 9999),
            'name' => fake()->name(),
            'ctc' => $gross * 12,
            'active' => true,
        ]);

        return SalaryStructure::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'employee_id' => $employee->id,
            'gross' => $gross,
            'basic' => $basic,
            'hra' => $basic * 0.4,
            'allowances' => max(0, $gross - $basic - $basic * 0.4),
            'compliant' => true,
        ]);
    }

    private function authHeader(User $user): array
    {
        $token = $user->createToken('api')->plainTextToken;

        return ['Authorization' => "Bearer $token"];
    }

    public function test_running_payroll_creates_a_draft_run_matching_payroll_service_totals(): void
    {
        $user = User::factory()->for($this->tenant)->create(['is_ceo' => true]);

        $response = $this->withHeaders($this->authHeader($user))
            ->postJson('/api/payroll/runs/run');

        $response->assertStatus(201)
            ->assertJsonPath('status', 'Draft')
            ->assertJsonPath('tenant_id', $this->tenant->id);

        $runId = $response->json('id');

        // Independently compute the expected totals via the ported service —
        // this is the "must match the ported service" assertion.
        $expected = ['gross' => 0.0, 'net' => 0.0, 'pf' => 0.0, 'esi' => 0.0, 'tds' => 0.0];
        foreach ($this->structures as $structure) {
            $calc = PayrollService::computePayslip([
                'gross' => $structure->gross,
                'basic' => $structure->basic,
                'annualGross' => $structure->gross * 12,
            ]);
            $expected['gross'] += $calc['gross'];
            $expected['net'] += $calc['netPay'];
            $expected['pf'] += $calc['pfEmployee'] + $calc['pfEmployer'];
            $expected['esi'] += $calc['esiEmployee'] + $calc['esiEmployer'];
            $expected['tds'] += $calc['tds'];
        }

        // Guard: with two real salary structures these totals must be positive —
        // catches the "run returned with initial 0 totals" persistence bug.
        $this->assertGreaterThan(0, $expected['gross']);
        $this->assertGreaterThan(0, $expected['net']);

        // The run row must carry the aggregated totals, not the initial zeros.
        $this->assertDatabaseHas('payroll_runs', [
            'id' => $runId,
            'gross_total' => $expected['gross'],
            'net_total' => $expected['net'],
            'pf_total' => $expected['pf'],
            'esi_total' => $expected['esi'],
            'tds_total' => $expected['tds'],
        ]);

        // The API response body itself must also reflect the persisted totals.
        $this->assertEqualsWithDelta($expected['gross'], (float) $response->json('gross_total'), 0.01);
        $this->assertEqualsWithDelta($expected['net'], (float) $response->json('net_total'), 0.01);
        $this->assertEqualsWithDelta($expected['pf'], (float) $response->json('pf_total'), 0.01);
        $this->assertEqualsWithDelta($expected['esi'], (float) $response->json('esi_total'), 0.01);
        $this->assertEqualsWithDelta($expected['tds'], (float) $response->json('tds_total'), 0.01);

        $this->assertDatabaseCount('payslips', 2);

        // Per-payslip PF/ESI must match the service too (not just the aggregate).
        foreach ($this->structures as $structure) {
            $calc = PayrollService::computePayslip([
                'gross' => $structure->gross,
                'basic' => $structure->basic,
                'annualGross' => $structure->gross * 12,
            ]);

            $this->assertDatabaseHas('payslips', [
                'payroll_run_id' => $runId,
                'employee_id' => $structure->employee_id,
                'pf_employee' => $calc['pfEmployee'],
                'pf_employer' => $calc['pfEmployer'],
                'esi_employee' => $calc['esiEmployee'],
                'esi_employer' => $calc['esiEmployer'],
                'net_pay' => $calc['netPay'],
            ]);
        }

        // Sanity: the higher earner (above the ESI threshold) pays no ESI.
        $highEarnerCalc = PayrollService::computePayslip([
            'gross' => 50000,
            'basic' => 25000,
            'annualGross' => 600000,
        ]);
        $this->assertSame(0, $highEarnerCalc['esiEmployee']);

        // And the lower earner (below the ₹21,000 ESI threshold) does.
        $lowEarnerCalc = PayrollService::computePayslip([
            'gross' => 20000,
            'basic' => 10000,
            'annualGross' => 240000,
        ]);
        $this->assertGreaterThan(0, $lowEarnerCalc['esiEmployee']);
    }

    public function test_a_second_run_advances_to_the_next_month(): void
    {
        $user = User::factory()->for($this->tenant)->create(['is_ceo' => true]);
        $headers = $this->authHeader($user);

        $first = $this->withHeaders($headers)->postJson('/api/payroll/runs/run')->assertStatus(201);
        $second = $this->withHeaders($headers)->postJson('/api/payroll/runs/run')->assertStatus(201);

        $firstPeriod = $first->json('year') * 12 + $first->json('month');
        $secondPeriod = $second->json('year') * 12 + $second->json('month');

        $this->assertSame($firstPeriod + 1, $secondPeriod);
    }

    public function test_run_fails_with_no_salary_structures(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['is_ceo' => true]);

        $this->withHeaders($this->authHeader($user))
            ->postJson('/api/payroll/runs/run')
            ->assertStatus(422);
    }

    public function test_a_locked_run_transitions_to_paid_and_rejects_out_of_order_transitions(): void
    {
        $user = User::factory()->for($this->tenant)->create(['is_ceo' => true]);
        $headers = $this->authHeader($user);

        $runId = $this->withHeaders($headers)->postJson('/api/payroll/runs/run')->json('id');

        // Can't pay a Draft run.
        $this->withHeaders($headers)->postJson("/api/payroll/runs/{$runId}/pay")->assertStatus(409);

        // Draft -> Locked.
        $this->withHeaders($headers)->postJson("/api/payroll/runs/{$runId}/lock")
            ->assertStatus(200)
            ->assertJsonPath('status', 'Locked');

        // Locking twice is rejected (no longer Draft).
        $this->withHeaders($headers)->postJson("/api/payroll/runs/{$runId}/lock")->assertStatus(409);

        // Locked -> Paid.
        $this->withHeaders($headers)->postJson("/api/payroll/runs/{$runId}/pay")
            ->assertStatus(200)
            ->assertJsonPath('status', 'Paid');

        // Paying twice is rejected (no longer Locked).
        $this->withHeaders($headers)->postJson("/api/payroll/runs/{$runId}/pay")->assertStatus(409);

        $this->assertDatabaseHas('payroll_runs', ['id' => $runId, 'status' => 'Paid']);
    }

    public function test_show_returns_payslip_register_with_net_pay_visible_for_unrestricted_user(): void
    {
        $user = User::factory()->for($this->tenant)->create(['is_ceo' => true]);
        $headers = $this->authHeader($user);

        $runId = $this->withHeaders($headers)->postJson('/api/payroll/runs/run')->json('id');

        $response = $this->withHeaders($headers)->getJson("/api/payroll/runs/{$runId}");

        $response->assertStatus(200)
            ->assertJsonCount(2, 'payslips');

        $this->assertIsNumeric($response->json('totals.net'));
        foreach ($response->json('payslips') as $slip) {
            $this->assertIsNumeric($slip['netPay']);
        }
    }

    public function test_show_masks_net_pay_when_rbac_hides_the_field(): void
    {
        $role = Role::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $this->tenant->id,
            'name' => 'Sales (restricted)',
            'permissions' => json_encode([
                'payroll' => ['read'],
                '_fields' => ['payslip.netPay' => 'hidden'],
            ]),
        ]);

        $user = User::factory()->for($this->tenant)->create([
            'is_ceo' => false,
            'role_id' => $role->id,
        ]);
        $headers = $this->authHeader($user);

        $runId = $this->withHeaders($headers)->postJson('/api/payroll/runs/run')->json('id');

        $response = $this->withHeaders($headers)->getJson("/api/payroll/runs/{$runId}");

        $response->assertStatus(200);
        $this->assertSame('•••', $response->json('totals.net'));
        foreach ($response->json('payslips') as $slip) {
            $this->assertSame('•••', $slip['netPay']);
        }
    }
}
