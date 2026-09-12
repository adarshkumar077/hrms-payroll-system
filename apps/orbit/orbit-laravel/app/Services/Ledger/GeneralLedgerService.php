<?php

namespace App\Services\Ledger;

use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Models\LedgerAccount;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Double-entry General Ledger. Every posting must balance (sum debits === sum credits).
 * Normal balances: Asset/Expense = debit-normal; Liability/Equity/Income = credit-normal.
 *
 * Ported from lib/gl.ts + lib/gl-constants.ts.
 */
class GeneralLedgerService
{
    public const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

    /** Default chart of accounts seeded per tenant. */
    public const DEFAULT_COA = [
        ['code' => '1000', 'name' => 'Cash', 'type' => 'Asset'],
        ['code' => '1010', 'name' => 'Bank', 'type' => 'Asset'],
        ['code' => '1100', 'name' => 'Accounts Receivable', 'type' => 'Asset'],
        ['code' => '1200', 'name' => 'Inventory', 'type' => 'Asset'],
        ['code' => '2000', 'name' => 'Accounts Payable', 'type' => 'Liability'],
        ['code' => '2100', 'name' => 'GST Payable', 'type' => 'Liability'],
        ['code' => '2200', 'name' => 'Salaries Payable', 'type' => 'Liability'],
        ['code' => '2300', 'name' => 'Statutory Dues (PF/ESI/TDS)', 'type' => 'Liability'],
        ['code' => '3000', 'name' => "Owner's Equity", 'type' => 'Equity'],
        ['code' => '3100', 'name' => 'Retained Earnings', 'type' => 'Equity'],
        ['code' => '4000', 'name' => 'Sales Revenue', 'type' => 'Income'],
        ['code' => '5000', 'name' => 'Salaries Expense', 'type' => 'Expense'],
        ['code' => '5100', 'name' => 'Cost of Goods Sold', 'type' => 'Expense'],
        ['code' => '5200', 'name' => 'Operating Expense', 'type' => 'Expense'],
    ];

    public static function isDebitNormal(string $type): bool
    {
        return $type === 'Asset' || $type === 'Expense';
    }

    /**
     * Idempotently ensure the tenant has a chart of accounts. Returns a code => LedgerAccount map.
     *
     * @return array<string, LedgerAccount>
     */
    public function ensureChart(string $tenantId): array
    {
        $existing = LedgerAccount::where('tenant_id', $tenantId)->get();
        if ($existing->count() === 0) {
            $now = now();
            $rows = array_map(fn (array $a) => [
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'code' => $a['code'],
                'name' => $a['name'],
                'type' => $a['type'],
                'is_system' => true,
                'created_at' => $now,
            ], self::DEFAULT_COA);
            LedgerAccount::insert($rows);
        }

        $all = LedgerAccount::where('tenant_id', $tenantId)->get();
        $byCode = [];
        foreach ($all as $account) {
            $byCode[$account->code] = $account;
        }

        return $byCode;
    }

    /**
     * Post a balanced journal entry. Throws if debits != credits.
     *
     * @param  array{tenantId: string, narration: string, reference?: ?string, source?: ?string, date?: ?\DateTimeInterface, lines: array<int, array{code: string, debit?: float, credit?: float}>}  $params
     */
    public function postJournal(array $params): JournalEntry
    {
        $tenantId = $params['tenantId'];
        $lines = $params['lines'] ?? [];

        $byCode = $this->ensureChart($tenantId);

        $totDr = self::round2(array_sum(array_map(fn ($l) => $l['debit'] ?? 0, $lines)));
        $totCr = self::round2(array_sum(array_map(fn ($l) => $l['credit'] ?? 0, $lines)));

        if ($totDr !== $totCr) {
            throw new InvalidArgumentException("Journal not balanced: Dr {$totDr} != Cr {$totCr}");
        }
        if ($totDr === 0.0) {
            throw new InvalidArgumentException('Journal has no amounts');
        }

        return DB::transaction(function () use ($tenantId, $params, $lines, $byCode) {
            $entry = JournalEntry::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'narration' => $params['narration'],
                'reference' => $params['reference'] ?? null,
                'source' => $params['source'] ?? 'manual',
                'date' => $params['date'] ?? now(),
                'created_at' => now(),
            ]);

            foreach ($lines as $l) {
                $code = $l['code'];
                $acc = $byCode[$code] ?? null;
                if (! $acc) {
                    throw new InvalidArgumentException("Unknown ledger account code {$code}");
                }
                JournalLine::create([
                    'id' => (string) Str::uuid(),
                    'journal_entry_id' => $entry->id,
                    'tenant_id' => $tenantId,
                    'account_id' => $acc->id,
                    'account_code' => $code,
                    'debit' => self::round2($l['debit'] ?? 0),
                    'credit' => self::round2($l['credit'] ?? 0),
                    'created_at' => now(),
                ]);
            }

            return $entry->load('lines');
        });
    }

    // ── Auto-posting hooks (called from module actions) ──────────

    /**
     * @param  array{number: string, subtotal: float, cgst?: float, sgst?: float, igst?: float, grandTotal: float}  $inv
     */
    public function postInvoiceJournal(string $tenantId, array $inv): JournalEntry
    {
        // Derive GST as the difference so the entry always balances despite per-component rounding.
        $gst = self::round2($inv['grandTotal'] - $inv['subtotal']);

        return $this->postJournal([
            'tenantId' => $tenantId,
            'narration' => "Sales invoice {$inv['number']}",
            'reference' => $inv['number'],
            'source' => 'invoice',
            'lines' => [
                ['code' => '1100', 'debit' => $inv['grandTotal']], // Dr Accounts Receivable
                ['code' => '4000', 'credit' => $inv['subtotal']], // Cr Sales Revenue
                ['code' => '2100', 'credit' => $gst], // Cr GST Payable
            ],
        ]);
    }

    /**
     * @param  array{receiptNo: string, amount: float, method: string}  $p
     */
    public function postPaymentJournal(string $tenantId, array $p): JournalEntry
    {
        $cashCode = $p['method'] === 'Cash' ? '1000' : '1010';

        return $this->postJournal([
            'tenantId' => $tenantId,
            'narration' => "Payment received {$p['receiptNo']}",
            'reference' => $p['receiptNo'],
            'source' => 'payment',
            'lines' => [
                ['code' => $cashCode, 'debit' => $p['amount']], // Dr Bank/Cash
                ['code' => '1100', 'credit' => $p['amount']], // Cr Accounts Receivable
            ],
        ]);
    }

    /**
     * @param  array{label: string, grossTotal: float, netTotal: float, pfTotal?: float, esiTotal?: float, tdsTotal?: float}  $run
     */
    public function postPayrollJournal(string $tenantId, array $run): JournalEntry
    {
        // Employee view: gross expense = net payable + employee-side statutory deductions.
        // Statutory credit is derived as (gross - net) so it balances exactly. (Employer-side
        // contributions would be a separate Dr Expense / Cr Statutory entry - omitted for simplicity.)
        $statutory = self::round2($run['grossTotal'] - $run['netTotal']);

        return $this->postJournal([
            'tenantId' => $tenantId,
            'narration' => "Payroll {$run['label']}",
            'reference' => "Payroll {$run['label']}",
            'source' => 'payroll',
            'lines' => [
                ['code' => '5000', 'debit' => $run['grossTotal']], // Dr Salaries Expense
                ['code' => '2200', 'credit' => $run['netTotal']], // Cr Salaries Payable (net)
                ['code' => '2300', 'credit' => $statutory], // Cr Statutory Dues (PF/ESI/TDS)
            ],
        ]);
    }

    // ── Reporting ────────────────────────────────────────────────

    /**
     * @param  array{from?: ?\DateTimeInterface, to?: ?\DateTimeInterface}|null  $range
     * @return array<int, array{code: string, name: string, type: string, debit: float, credit: float, balance: float}>
     */
    public function trialBalance(string $tenantId, ?array $range = null): array
    {
        $accounts = LedgerAccount::where('tenant_id', $tenantId)->orderBy('code')->get();

        $lineQuery = JournalLine::where('journal_lines.tenant_id', $tenantId);
        if ($range && (($range['from'] ?? null) || ($range['to'] ?? null))) {
            $lineQuery->join('journal_entries', 'journal_entries.id', '=', 'journal_lines.journal_entry_id');
            if (! empty($range['from'])) {
                $lineQuery->where('journal_entries.date', '>=', $range['from']);
            }
            if (! empty($range['to'])) {
                $lineQuery->where('journal_entries.date', '<=', $range['to']);
            }
        }

        $sumsRaw = $lineQuery
            ->selectRaw('journal_lines.account_code as account_code, SUM(journal_lines.debit) as d, SUM(journal_lines.credit) as c')
            ->groupBy('journal_lines.account_code')
            ->get();

        $sums = [];
        foreach ($sumsRaw as $row) {
            $sums[$row->account_code] = ['d' => (float) $row->d, 'c' => (float) $row->c];
        }

        return $accounts->map(function (LedgerAccount $a) use ($sums) {
            $s = $sums[$a->code] ?? ['d' => 0.0, 'c' => 0.0];
            $bal = self::isDebitNormal($a->type) ? $s['d'] - $s['c'] : $s['c'] - $s['d'];

            return [
                'code' => $a->code,
                'name' => $a->name,
                'type' => $a->type,
                'debit' => self::round2($s['d']),
                'credit' => self::round2($s['c']),
                'balance' => self::round2($bal),
            ];
        })->values()->all();
    }

    /**
     * @param  array{from?: ?\DateTimeInterface, to?: ?\DateTimeInterface}|null  $range
     */
    public function financialStatements(string $tenantId, ?array $range = null): array
    {
        $tb = $this->trialBalance($tenantId, $range);

        $sumType = fn (string $t) => self::round2(array_sum(array_map(
            fn ($r) => $r['balance'],
            array_filter($tb, fn ($r) => $r['type'] === $t)
        )));

        $income = $sumType('Income');
        $expense = $sumType('Expense');
        $netProfit = self::round2($income - $expense);
        $assets = $sumType('Asset');
        $liabilities = $sumType('Liability');
        $equity = self::round2($sumType('Equity') + $netProfit); // net profit rolls into equity

        return [
            'pnl' => [
                'income' => $income,
                'expense' => $expense,
                'netProfit' => $netProfit,
                'rows' => array_values(array_filter($tb, fn ($r) => $r['type'] === 'Income' || $r['type'] === 'Expense')),
            ],
            'balanceSheet' => [
                'assets' => $assets,
                'liabilities' => $liabilities,
                'equity' => $equity,
                'balanced' => abs($assets - ($liabilities + $equity)) < 1,
                'rows' => array_values(array_filter($tb, fn ($r) => $r['type'] === 'Asset' || $r['type'] === 'Liability' || $r['type'] === 'Equity')),
            ],
        ];
    }

    public static function round2(float $n): float
    {
        return round(($n ?: 0) * 100) / 100;
    }
}
