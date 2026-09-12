<?php

namespace App\Http\Controllers\Api\Finance;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\VendorBill;
use App\Services\Ledger\GeneralLedgerService;
use Illuminate\Http\JsonResponse;

/**
 * Financial Reports — read-only rollups over the GL + Invoice/VendorBill tables.
 * Ported for the Financial Reports page (previously a Dashboard placeholder).
 *
 * Reuses GeneralLedgerService as-is (ensureChart -> trialBalance -> financialStatements);
 * no new ledger math is introduced here. GST + receivables/payables mirror the aggregations
 * in App\Services\Copilot::runIntent('gst_tax_collected' / 'receivables_outstanding') and
 * VendorBillController's status model (Draft -> Approved -> Paid).
 */
class ReportController extends Controller
{
    public function __construct(private readonly GeneralLedgerService $gl) {}

    /** GET /api/finance/reports */
    public function index(): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;

        // Idempotent — seeds the default chart of accounts on first call for a fresh tenant.
        $this->gl->ensureChart($tenantId);

        $trialBalance = $this->gl->trialBalance($tenantId);
        $statements = $this->gl->financialStatements($tenantId);

        // GST collected on Finalized+Paid invoices — mirrors Copilot::gst_tax_collected.
        $gstAgg = Invoice::forTenant($tenantId)
            ->whereIn('status', ['Finalized', 'Paid'])
            ->selectRaw('SUM(cgst) as cgst_sum, SUM(sgst) as sgst_sum, SUM(igst) as igst_sum')
            ->first();

        $cgst = round((float) ($gstAgg->cgst_sum ?? 0), 2);
        $sgst = round((float) ($gstAgg->sgst_sum ?? 0), 2);
        $igst = round((float) ($gstAgg->igst_sum ?? 0), 2);

        // Receivables — unpaid sales invoices (Draft/Finalized), mirrors
        // Copilot::receivables_outstanding.
        $receivablesQuery = Invoice::forTenant($tenantId)->whereIn('status', ['Draft', 'Finalized']);
        $receivablesTotal = round((float) $receivablesQuery->sum('grand_total'), 2);
        $receivablesCount = (clone $receivablesQuery)->count();

        // Payables — unpaid vendor bills (Draft/Approved, not yet Paid).
        $payablesQuery = VendorBill::forTenant($tenantId)->whereIn('status', ['Draft', 'Approved']);
        $payablesTotal = round((float) $payablesQuery->sum('total'), 2);
        $payablesCount = (clone $payablesQuery)->count();

        return response()->json([
            'trialBalance' => $trialBalance,
            'profitAndLoss' => $statements['pnl'],
            'balanceSheet' => $statements['balanceSheet'],
            'gstSummary' => [
                'cgst' => $cgst,
                'sgst' => $sgst,
                'igst' => $igst,
                'total' => round($cgst + $sgst + $igst, 2),
            ],
            'receivables' => [
                'total' => $receivablesTotal,
                'count' => $receivablesCount,
            ],
            'payables' => [
                'total' => $payablesTotal,
                'count' => $payablesCount,
            ],
        ]);
    }
}
