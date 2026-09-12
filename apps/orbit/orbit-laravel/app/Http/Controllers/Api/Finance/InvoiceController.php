<?php

namespace App\Http\Controllers\Api\Finance;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Payment;
use App\Models\Tenant;
use App\Services\Compliance\GstService;
use App\Services\Ledger\GeneralLedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * GST sales invoices. Ported from app/(app)/finance/invoices/actions.ts.
 *
 * store()      — computes GST via GstService::computeGst; intra-state (CGST+SGST) when the
 *                buyer account's state matches the tenant home state, else inter-state (IGST).
 * finalize()   — Draft -> Finalized; if e-invoicing is mandated (AATO > 5cr, B2B), stamps a
 *                mock IRN/Ack/e-way (no live IRP adapter has been ported yet — mirrors the
 *                `mockEInvoice()` fallback in lib/irp.ts); then posts the GL journal. The GL
 *                posting is wrapped in try/catch so a ledger error never blocks finalization.
 * recordPayment() — Finalized -> Paid; writes a Payment with a receipt number and posts the
 *                GL payment journal (also failure-isolated).
 *
 * Note: Invoice/VendorBill models don't declare `lines`/`payments` Eloquent relationships yet,
 * so this controller attaches them manually via setRelation() rather than ->with()/->load(),
 * to avoid touching the model files.
 */
class InvoiceController extends Controller
{
    // Tenant home state — mirrors HOME_STATE in finance/invoices/actions.ts. Intra-state
    // (CGST+SGST) applies when the buyer account's state matches; otherwise inter-state (IGST).
    private const HOME_STATE = 'Maharashtra';

    // e-way bill required above this consignment value (mirrors EWAY_THRESHOLD in lib/irp.ts).
    private const EWAY_THRESHOLD = 50000;

    public function __construct(private readonly GeneralLedgerService $gl) {}

    /** GET /api/finance/invoices */
    public function index(Request $request): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;

        $query = Invoice::forTenant($tenantId)->orderByDesc('created_at');

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }
        if ($accountId = $request->get('account_id')) {
            $query->where('account_id', $accountId);
        }

        $invoices = $query->paginate((int) $request->get('per_page', 15));
        $this->attachLines(collect($invoices->items()));

        return response()->json($invoices);
    }

    /** GET /api/finance/invoices/{id} */
    public function show(string $id): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;
        $invoice = Invoice::forTenant($tenantId)->findOrFail($id);

        $this->attachLines(collect([$invoice]));
        $invoice->setRelation('payments', Payment::forTenant($tenantId)->where('invoice_id', $invoice->id)->get());

        return response()->json($invoice);
    }

    /** POST /api/finance/invoices */
    public function store(Request $request): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;

        $data = $request->validate([
            'account_id' => ['required', 'string'],
            'invoice_type' => ['nullable', 'string', 'in:B2B,B2C'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.description' => ['required', 'string'],
            'lines.*.hsn' => ['nullable', 'string'],
            'lines.*.qty' => ['required', 'numeric', 'min:0.01'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.tax_rate' => ['nullable', 'numeric', 'min:0'],
        ]);

        $account = Account::forTenant($tenantId)->find($data['account_id']);
        if (! $account) {
            return response()->json(['error' => 'Account not found.'], 404);
        }

        $invoiceType = $data['invoice_type'] ?? 'B2B';
        $intraState = $account->state === self::HOME_STATE;

        $lines = array_map(fn (array $l) => [
            'description' => $l['description'],
            'hsn' => $l['hsn'] ?? null,
            'qty' => (float) $l['qty'],
            'unitPrice' => (float) $l['unit_price'],
            'taxRate' => (float) ($l['tax_rate'] ?? 18),
        ], $data['lines']);

        $gst = GstService::computeGst($lines, $intraState);

        // Sequential-ish invoice number scoped to the tenant.
        $count = Invoice::forTenant($tenantId)->count();
        $number = 'INV-2026-'.(600 + $count);

        $invoice = DB::transaction(function () use ($tenantId, $account, $invoiceType, $number, $gst, $lines) {
            $invoice = Invoice::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'account_id' => $account->id,
                'number' => $number,
                'invoice_type' => $invoiceType,
                'place_of_supply' => $account->state,
                'subtotal' => $gst['subtotal'],
                'cgst' => $gst['cgst'],
                'sgst' => $gst['sgst'],
                'igst' => $gst['igst'],
                'grand_total' => $gst['grandTotal'],
                'status' => 'Draft',
            ]);

            $createdLines = collect();
            foreach ($lines as $l) {
                $createdLines->push(InvoiceLine::create([
                    'id' => (string) Str::uuid(),
                    'invoice_id' => $invoice->id,
                    'description' => $l['description'],
                    'hsn' => $l['hsn'],
                    'qty' => $l['qty'],
                    'unit_price' => $l['unitPrice'],
                    'tax_rate' => $l['taxRate'],
                    'line_total' => GeneralLedgerService::round2($l['qty'] * $l['unitPrice']),
                ]));
            }
            $invoice->setRelation('lines', $createdLines);

            return $invoice;
        });

        return response()->json($invoice, 201);
    }

    /**
     * POST /api/finance/invoices/{id}/finalize
     * Draft -> Finalized. Stamps e-invoice fields when mandated, then posts the sales
     * journal via GeneralLedgerService::postInvoiceJournal (never blocks on GL failure).
     */
    public function finalize(string $id): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;
        $invoice = Invoice::forTenant($tenantId)->findOrFail($id);

        if ($invoice->status !== 'Draft') {
            return response()->json(['error' => 'Only a Draft invoice can be finalized.'], 422);
        }

        $tenant = Tenant::find($tenantId);

        $updates = ['status' => 'Finalized'];

        if ($tenant && GstService::requiresEInvoice((float) ($tenant->aato ?? 0), $invoice->invoice_type)) {
            $updates['irn'] = GstService::mockIrn($invoice->number);
            $updates['ack_no'] = (string) (1_000_000_000_000 + (abs(self::jsHash($invoice->number)) % 900_000_000_000));

            if ((float) $invoice->grand_total > self::EWAY_THRESHOLD) {
                $updates['eway_bill_no'] = (string) (300_000_000_000 + (abs(self::jsHash($invoice->number.'eway')) % 99_999_999_999));
            }
        }

        $invoice->update($updates);

        // GL auto-posting is additive and must never break invoice finalization.
        try {
            $this->gl->postInvoiceJournal($tenantId, [
                'number' => $invoice->number,
                'subtotal' => (float) $invoice->subtotal,
                'cgst' => (float) $invoice->cgst,
                'sgst' => (float) $invoice->sgst,
                'igst' => (float) $invoice->igst,
                'grandTotal' => (float) $invoice->grand_total,
            ]);
        } catch (Throwable $e) {
            Log::error('postInvoiceJournal failed', ['invoice_id' => $invoice->id, 'error' => $e->getMessage()]);
        }

        return response()->json($invoice->fresh());
    }

    /**
     * POST /api/finance/invoices/{id}/payments
     * Finalized -> Paid. Creates a Payment with a receipt number, then posts the GL
     * receipt journal (never blocks on GL failure).
     */
    public function recordPayment(Request $request, string $id): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;
        $invoice = Invoice::forTenant($tenantId)->findOrFail($id);

        if ($invoice->status !== 'Finalized') {
            return response()->json(['error' => 'Only a Finalized invoice can receive a payment.'], 422);
        }

        $data = $request->validate([
            'amount' => ['nullable', 'numeric', 'min:0.01'],
            'method' => ['nullable', 'string', 'in:Manual,UPI,Razorpay,NEFT,Cash'],
            'reference' => ['nullable', 'string', 'max:255'],
        ]);

        $method = $data['method'] ?? 'Manual';
        $amount = $data['amount'] ?? (float) $invoice->grand_total;
        $reference = $data['reference'] ?? null;

        $year = date('Y');
        $count = Payment::forTenant($tenantId)->count();
        $receiptNo = "RCPT-{$year}-".(1000 + $count);

        $payment = DB::transaction(function () use ($tenantId, $invoice, $amount, $method, $reference, $receiptNo) {
            $payment = Payment::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'invoice_id' => $invoice->id,
                'amount' => $amount,
                'method' => $method,
                'reference' => $reference,
                'receipt_no' => $receiptNo,
                'status' => 'Success',
            ]);

            $invoice->update(['status' => 'Paid']);

            return $payment;
        });

        // GL auto-posting is additive and must never break payment recording.
        try {
            $this->gl->postPaymentJournal($tenantId, [
                'receiptNo' => $payment->receipt_no,
                'amount' => (float) $amount,
                'method' => $method,
            ]);
        } catch (Throwable $e) {
            Log::error('postPaymentJournal failed', ['payment_id' => $payment->id, 'error' => $e->getMessage()]);
        }

        return response()->json(['payment' => $payment, 'invoice' => $invoice->fresh()], 201);
    }

    /** Attach invoice_lines to a collection of Invoice models via a single bulk query. */
    private function attachLines(\Illuminate\Support\Collection $invoices): void
    {
        if ($invoices->isEmpty()) {
            return;
        }
        $ids = $invoices->pluck('id')->all();
        $lines = InvoiceLine::whereIn('invoice_id', $ids)->get()->groupBy('invoice_id');
        foreach ($invoices as $invoice) {
            $invoice->setRelation('lines', $lines->get($invoice->id, collect()));
        }
    }

    /** JS `(h * 31 + charCode) | 0` — 32-bit signed overflow hash, for deterministic mock Ack/e-way numbers. */
    private static function jsHash(string $seed): int
    {
        $h = 0;
        $len = strlen($seed);
        for ($i = 0; $i < $len; $i++) {
            $h = self::toInt32($h * 31 + ord($seed[$i]));
        }

        return $h;
    }

    private static function toInt32(int $n): int
    {
        $n &= 0xFFFFFFFF;

        return $n >= 0x80000000 ? $n - 0x100000000 : $n;
    }
}
