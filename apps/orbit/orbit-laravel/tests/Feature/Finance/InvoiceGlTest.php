<?php

namespace Tests\Feature\Finance;

use App\Models\Account;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Ledger\GeneralLedgerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Proves the finance -> GL integration: creating + finalizing a GST invoice and recording a
 * payment against it must leave GeneralLedgerService::trialBalance() balanced (sum of all
 * debits === sum of all credits across every account), and the CGST/SGST/IGST split from
 * GstService::computeGst must land correctly on the invoice and in GST Payable (2100).
 */
class InvoiceGlTest extends TestCase
{
    use RefreshDatabase;

    private function actingTenant(array $tenantAttrs = []): Tenant
    {
        $tenant = Tenant::factory()->create(array_merge([
            'gstin' => '27ABCDE1234F1Z5',
            'aato' => 1_000_000, // well under the 5cr e-invoice threshold
        ], $tenantAttrs));

        $user = User::factory()->for($tenant)->create();
        Sanctum::actingAs($user, ['*']);

        return $tenant;
    }

    public function test_intra_state_invoice_finalize_and_payment_keep_trial_balance_balanced(): void
    {
        $tenant = $this->actingTenant();

        // Buyer in the tenant's home state (Maharashtra) -> intra-state -> CGST+SGST split.
        $account = Account::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenant->id,
            'name' => 'Acme Buyer',
            'state' => 'Maharashtra',
            'gstin' => '27AAAAA0000A1Z5',
        ]);

        $create = $this->postJson('/api/finance/invoices', [
            'account_id' => $account->id,
            'invoice_type' => 'B2B',
            'lines' => [
                ['description' => 'Widget', 'hsn' => '8471', 'qty' => 2, 'unit_price' => 1000, 'tax_rate' => 18],
            ],
        ]);

        $create->assertStatus(201);

        // subtotal = 2 * 1000 = 2000; tax = 18% of 2000 = 360 -> cgst 180 / sgst 180 / igst 0.
        // Use delta-tolerant equality on numerics: SQLite returns integer-valued doubles as JSON
        // ints, so assertJsonPath's strict compare would fail 2000 (int) vs 2000.0 (float).
        $this->assertEqualsWithDelta(2000, $create->json('subtotal'), 0.01);
        $this->assertEqualsWithDelta(180, $create->json('cgst'), 0.01);
        $this->assertEqualsWithDelta(180, $create->json('sgst'), 0.01);
        $this->assertEqualsWithDelta(0, $create->json('igst'), 0.01);
        $this->assertEqualsWithDelta(2360, $create->json('grand_total'), 0.01);
        $create->assertJsonPath('status', 'Draft');

        $invoiceId = $create->json('id');

        $finalize = $this->postJson("/api/finance/invoices/{$invoiceId}/finalize");
        $finalize->assertStatus(200)
            ->assertJsonPath('status', 'Finalized')
            // AATO is well under 5cr, so no e-invoice/IRN should be stamped.
            ->assertJsonPath('irn', null);

        $pay = $this->postJson("/api/finance/invoices/{$invoiceId}/payments", [
            'method' => 'NEFT',
        ]);
        $pay->assertStatus(201)->assertJsonPath('invoice.status', 'Paid');
        $this->assertEqualsWithDelta(2360, $pay->json('payment.amount'), 0.01);

        $this->assertNotEmpty($pay->json('payment.receipt_no'));

        $gl = app(GeneralLedgerService::class);
        $tb = collect($gl->trialBalance($tenant->id));

        // Trial balance must stay balanced: sum of all debits === sum of all credits.
        $totalDebit = $tb->sum('debit');
        $totalCredit = $tb->sum('credit');
        $this->assertEqualsWithDelta($totalDebit, $totalCredit, 0.01);
        $this->assertGreaterThan(0, $totalDebit);

        // Accounts Receivable (1100) nets back to 0: invoice debited 2360, payment credited 2360.
        $ar = $tb->firstWhere('code', '1100');
        $this->assertNotNull($ar);
        $this->assertEqualsWithDelta(0, $ar['balance'], 0.01);

        // Bank (1010, NEFT is non-cash) carries the full receipt as a debit-normal balance.
        $bank = $tb->firstWhere('code', '1010');
        $this->assertNotNull($bank);
        $this->assertEqualsWithDelta(2360, $bank['balance'], 0.01);

        // GST Payable (2100, credit-normal) carries cgst + sgst = 360.
        $gstPayable = $tb->firstWhere('code', '2100');
        $this->assertNotNull($gstPayable);
        $this->assertEqualsWithDelta(360, $gstPayable['balance'], 0.01);

        // Sales Revenue (4000, credit-normal) carries the taxable subtotal.
        $sales = $tb->firstWhere('code', '4000');
        $this->assertNotNull($sales);
        $this->assertEqualsWithDelta(2000, $sales['balance'], 0.01);
    }

    public function test_inter_state_invoice_splits_igst_only_and_stays_balanced_after_finalize(): void
    {
        $tenant = $this->actingTenant();

        // Buyer outside the tenant's home state -> inter-state -> IGST only.
        $account = Account::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenant->id,
            'name' => 'Delhi Buyer',
            'state' => 'Delhi',
        ]);

        $create = $this->postJson('/api/finance/invoices', [
            'account_id' => $account->id,
            'lines' => [
                ['description' => 'Gadget', 'qty' => 1, 'unit_price' => 5000, 'tax_rate' => 12],
            ],
        ]);

        $create->assertStatus(201);
        $this->assertEqualsWithDelta(0, $create->json('cgst'), 0.01);
        $this->assertEqualsWithDelta(0, $create->json('sgst'), 0.01);
        $this->assertEqualsWithDelta(600, $create->json('igst'), 0.01);
        $this->assertEqualsWithDelta(5600, $create->json('grand_total'), 0.01);

        $invoiceId = $create->json('id');

        $this->postJson("/api/finance/invoices/{$invoiceId}/finalize")->assertStatus(200);

        $gl = app(GeneralLedgerService::class);
        $tb = collect($gl->trialBalance($tenant->id));
        $this->assertEqualsWithDelta($tb->sum('debit'), $tb->sum('credit'), 0.01);

        $gstPayable = $tb->firstWhere('code', '2100');
        $this->assertEqualsWithDelta(600, $gstPayable['balance'], 0.01);
    }

    public function test_finalize_stamps_a_mock_irn_when_e_invoicing_is_mandated(): void
    {
        // AATO > ₹5cr on a B2B invoice mandates e-invoicing (GstService::requiresEInvoice).
        $tenant = $this->actingTenant(['aato' => 60_000_000]);

        $account = Account::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenant->id,
            'name' => 'Big Buyer',
            'state' => 'Maharashtra',
        ]);

        $create = $this->postJson('/api/finance/invoices', [
            'account_id' => $account->id,
            'invoice_type' => 'B2B',
            'lines' => [
                ['description' => 'Bulk Order', 'qty' => 100, 'unit_price' => 1000, 'tax_rate' => 18],
            ],
        ]);
        $create->assertStatus(201);
        $invoiceId = $create->json('id');

        $finalize = $this->postJson("/api/finance/invoices/{$invoiceId}/finalize");
        $finalize->assertStatus(200)->assertJsonPath('status', 'Finalized');

        $irn = $finalize->json('irn');
        $this->assertNotNull($irn);
        $this->assertSame(64, strlen($irn));
        $this->assertNotNull($finalize->json('ack_no'));
        // grand_total (118,000) is above the ₹50k e-way threshold.
        $this->assertNotNull($finalize->json('eway_bill_no'));

        // A GL error must never block finalize — trial balance still balances afterward.
        $gl = app(GeneralLedgerService::class);
        $tb = collect($gl->trialBalance($tenant->id));
        $this->assertEqualsWithDelta($tb->sum('debit'), $tb->sum('credit'), 0.01);
    }

    public function test_vendor_bill_approve_and_pay_keep_trial_balance_balanced(): void
    {
        $tenant = $this->actingTenant();

        $create = $this->postJson('/api/finance/bills', [
            'vendor' => 'Office Supplies Co',
            'bill_number' => 'BILL-001',
            'lines' => [
                ['description' => 'Stationery', 'qty' => 10, 'unit_price' => 100, 'tax_rate' => 18],
            ],
        ]);
        $create->assertStatus(201)->assertJsonPath('status', 'Draft');
        $this->assertEqualsWithDelta(1000, $create->json('subtotal'), 0.01);
        $this->assertEqualsWithDelta(180, $create->json('tax'), 0.01);
        $this->assertEqualsWithDelta(1180, $create->json('total'), 0.01);

        $billId = $create->json('id');

        $this->postJson("/api/finance/bills/{$billId}/approve")
            ->assertStatus(200)
            ->assertJsonPath('status', 'Approved');

        $this->postJson("/api/finance/bills/{$billId}/pay")
            ->assertStatus(200)
            ->assertJsonPath('status', 'Paid');

        $gl = app(GeneralLedgerService::class);
        $tb = collect($gl->trialBalance($tenant->id));
        $this->assertEqualsWithDelta($tb->sum('debit'), $tb->sum('credit'), 0.01);

        // Accounts Payable (2000) nets back to 0: approve credited 1180, pay debited 1180.
        $ap = $tb->firstWhere('code', '2000');
        $this->assertEqualsWithDelta(0, $ap['balance'], 0.01);

        // Bank (1010) is credited (money out) -> debit-normal balance goes negative.
        $bank = $tb->firstWhere('code', '1010');
        $this->assertEqualsWithDelta(-1180, $bank['balance'], 0.01);
    }
}
