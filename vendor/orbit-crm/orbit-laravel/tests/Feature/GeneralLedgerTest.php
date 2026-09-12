<?php

namespace Tests\Feature;

use App\Services\Ledger\GeneralLedgerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use Tests\TestCase;

class GeneralLedgerTest extends TestCase
{
    use RefreshDatabase;

    private GeneralLedgerService $gl;

    protected function setUp(): void
    {
        parent::setUp();
        $this->gl = new GeneralLedgerService;
    }

    public function test_ensure_chart_seeds_default_chart_of_accounts(): void
    {
        $byCode = $this->gl->ensureChart('t1');

        $this->assertCount(count(GeneralLedgerService::DEFAULT_COA), $byCode);
        $this->assertArrayHasKey('1000', $byCode);
        $this->assertArrayHasKey('4000', $byCode);

        // Idempotent: calling again does not duplicate rows.
        $byCodeAgain = $this->gl->ensureChart('t1');
        $this->assertCount(count(GeneralLedgerService::DEFAULT_COA), $byCodeAgain);
    }

    public function test_a_balanced_journal_posts(): void
    {
        $entry = $this->gl->postJournal([
            'tenantId' => 't1',
            'narration' => 'Test balanced entry',
            'lines' => [
                ['code' => '1000', 'debit' => 500],
                ['code' => '4000', 'credit' => 500],
            ],
        ]);

        $this->assertNotNull($entry->id);
        $this->assertCount(2, $entry->lines);

        $totalDebit = $entry->lines->sum('debit');
        $totalCredit = $entry->lines->sum('credit');
        $this->assertEqualsWithDelta($totalCredit, $totalDebit, 0.001);
        $this->assertEqualsWithDelta(500, $totalDebit, 0.001);
    }

    public function test_an_unbalanced_journal_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->gl->postJournal([
            'tenantId' => 't1',
            'narration' => 'Unbalanced entry',
            'lines' => [
                ['code' => '1000', 'debit' => 500],
                ['code' => '4000', 'credit' => 400],
            ],
        ]);
    }

    public function test_a_journal_with_no_amounts_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->gl->postJournal([
            'tenantId' => 't1',
            'narration' => 'Empty entry',
            'lines' => [
                ['code' => '1000', 'debit' => 0],
                ['code' => '4000', 'credit' => 0],
            ],
        ]);
    }

    public function test_a_journal_with_unknown_account_code_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->gl->postJournal([
            'tenantId' => 't1',
            'narration' => 'Bad account',
            'lines' => [
                ['code' => '9999', 'debit' => 100],
                ['code' => '4000', 'credit' => 100],
            ],
        ]);
    }

    public function test_invoice_and_payment_keep_trial_balance_balanced_and_ar_nets_to_zero(): void
    {
        $tenantId = 't1';

        $this->gl->postInvoiceJournal($tenantId, [
            'number' => 'INV-001',
            'subtotal' => 1000,
            'grandTotal' => 1180,
        ]);

        $tbAfterInvoice = collect($this->gl->trialBalance($tenantId));
        $totalDebit = collect($tbAfterInvoice)->sum('debit');
        $totalCredit = collect($tbAfterInvoice)->sum('credit');
        $this->assertEqualsWithDelta($totalDebit, $totalCredit, 0.01);

        $this->gl->postPaymentJournal($tenantId, [
            'receiptNo' => 'RCPT-001',
            'amount' => 1180,
            'method' => 'Bank',
        ]);

        $tbAfterPayment = collect($this->gl->trialBalance($tenantId));

        // Trial balance (sum of all debit-side postings vs credit-side postings) must still balance.
        $this->assertEqualsWithDelta($tbAfterPayment->sum('debit'), $tbAfterPayment->sum('credit'), 0.01);

        // Accounts Receivable (1100) should net to ~0: invoice debited 1180, payment credited 1180.
        $ar = $tbAfterPayment->firstWhere('code', '1100');
        $this->assertNotNull($ar);
        $this->assertEqualsWithDelta(0, $ar['balance'], 0.01);

        // Bank (1010) should carry the full receipt as a debit-normal balance.
        $bank = $tbAfterPayment->firstWhere('code', '1010');
        $this->assertEqualsWithDelta(1180, $bank['balance'], 0.01);
    }

    public function test_payroll_journal_balances_and_posts_statutory_as_difference(): void
    {
        $tenantId = 't1';

        $this->gl->postPayrollJournal($tenantId, [
            'label' => '7/2026',
            'grossTotal' => 100000,
            'netTotal' => 82000,
            'pfTotal' => 12000,
            'esiTotal' => 3000,
            'tdsTotal' => 3000,
        ]);

        $tb = collect($this->gl->trialBalance($tenantId));
        $this->assertEqualsWithDelta($tb->sum('debit'), $tb->sum('credit'), 0.01);

        $statutory = $tb->firstWhere('code', '2300');
        $this->assertEqualsWithDelta(18000, $statutory['balance'], 0.01);

        $payable = $tb->firstWhere('code', '2200');
        $this->assertEqualsWithDelta(82000, $payable['balance'], 0.01);

        $expense = $tb->firstWhere('code', '5000');
        $this->assertEqualsWithDelta(100000, $expense['balance'], 0.01);
    }

    public function test_financial_statements_balance_sheet_is_balanced(): void
    {
        $tenantId = 't1';

        $this->gl->postInvoiceJournal($tenantId, [
            'number' => 'INV-100',
            'subtotal' => 2000,
            'grandTotal' => 2360,
        ]);

        $this->gl->postPaymentJournal($tenantId, [
            'receiptNo' => 'RCPT-100',
            'amount' => 1000,
            'method' => 'Cash',
        ]);

        $this->gl->postPayrollJournal($tenantId, [
            'label' => '7/2026',
            'grossTotal' => 50000,
            'netTotal' => 41000,
            'pfTotal' => 6000,
            'esiTotal' => 1500,
            'tdsTotal' => 1500,
        ]);

        $statements = $this->gl->financialStatements($tenantId);

        $this->assertTrue($statements['balanceSheet']['balanced']);
        $this->assertEqualsWithDelta(
            $statements['balanceSheet']['assets'],
            $statements['balanceSheet']['liabilities'] + $statements['balanceSheet']['equity'],
            1.0
        );

        // Sanity: net profit = income - expense should be reflected in pnl.
        $expectedNetProfit = round(($statements['pnl']['income'] - $statements['pnl']['expense']) * 100) / 100;
        $this->assertEqualsWithDelta($expectedNetProfit, $statements['pnl']['netProfit'], 0.01);
    }
}
