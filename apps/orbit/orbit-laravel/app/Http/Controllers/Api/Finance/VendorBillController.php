<?php

namespace App\Http\Controllers\Api\Finance;

use App\Http\Controllers\Controller;
use App\Models\VendorBill;
use App\Models\VendorBillLine;
use App\Services\Ledger\GeneralLedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Vendor bills / Accounts Payable. Ported from app/(app)/finance/bills/actions.ts + lib/ap.ts.
 *
 * GeneralLedgerService has postInvoiceJournal/postPaymentJournal but no
 * postVendorBillJournal/postBillPaymentJournal helper — per lib/ap.ts these go straight
 * through postJournal() with the same account codes: approve = Dr 5200 (Operating Expense)
 * / Cr 2000 (Accounts Payable); pay = Dr 2000 (Accounts Payable) / Cr 1010 (Bank). Both
 * postings are failure-isolated so a GL error never blocks the status transition.
 */
class VendorBillController extends Controller
{
    public function __construct(private readonly GeneralLedgerService $gl) {}

    /** GET /api/finance/bills */
    public function index(Request $request): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;

        $query = VendorBill::forTenant($tenantId)->orderByDesc('created_at');

        if ($status = $request->get('status')) {
            $query->where('status', $status);
        }
        if ($vendor = $request->get('vendor')) {
            $query->where('vendor', 'like', "%{$vendor}%");
        }

        $bills = $query->paginate((int) $request->get('per_page', 15));
        $this->attachLines(collect($bills->items()));

        return response()->json($bills);
    }

    /** GET /api/finance/bills/{id} */
    public function show(string $id): JsonResponse
    {
        $bill = VendorBill::forTenant(auth()->user()->tenant_id)->findOrFail($id);
        $this->attachLines(collect([$bill]));

        return response()->json($bill);
    }

    /** POST /api/finance/bills — create a Draft vendor bill (+ lines). */
    public function store(Request $request): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;

        $data = $request->validate([
            'vendor' => ['required', 'string', 'max:255'],
            'gstin' => ['nullable', 'string', 'max:20'],
            'bill_number' => ['required', 'string', 'max:255'],
            'due_date' => ['nullable', 'date'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.description' => ['required', 'string'],
            'lines.*.hsn' => ['nullable', 'string'],
            'lines.*.qty' => ['required', 'numeric', 'min:0.01'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.tax_rate' => ['nullable', 'numeric', 'min:0'],
        ]);

        $subtotal = 0.0;
        $tax = 0.0;
        $lineInputs = [];
        foreach ($data['lines'] as $l) {
            $qty = (float) $l['qty'];
            $unitPrice = (float) $l['unit_price'];
            $taxRate = (float) ($l['tax_rate'] ?? 18);
            $lineBase = GeneralLedgerService::round2($qty * $unitPrice);
            $lineTax = GeneralLedgerService::round2($lineBase * $taxRate / 100);
            $subtotal += $lineBase;
            $tax += $lineTax;
            $lineInputs[] = [
                'description' => $l['description'],
                'hsn' => $l['hsn'] ?? null,
                'qty' => $qty,
                'unit_price' => $unitPrice,
                'tax_rate' => $taxRate,
                'line_total' => $lineBase,
            ];
        }
        $subtotal = GeneralLedgerService::round2($subtotal);
        $tax = GeneralLedgerService::round2($tax);
        $total = GeneralLedgerService::round2($subtotal + $tax);

        $bill = DB::transaction(function () use ($tenantId, $data, $lineInputs, $subtotal, $tax, $total) {
            $bill = VendorBill::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'vendor' => $data['vendor'],
                'gstin' => $data['gstin'] ?? null,
                'bill_number' => $data['bill_number'],
                'due_date' => $data['due_date'] ?? null,
                'subtotal' => $subtotal,
                'tax' => $tax,
                'total' => $total,
                'status' => 'Draft',
                'source' => 'manual',
            ]);

            $createdLines = collect();
            foreach ($lineInputs as $l) {
                $createdLines->push(VendorBillLine::create([
                    'id' => (string) Str::uuid(),
                    'vendor_bill_id' => $bill->id,
                    ...$l,
                ]));
            }
            $bill->setRelation('lines', $createdLines);

            return $bill;
        });

        return response()->json($bill, 201);
    }

    /** POST /api/finance/bills/{id}/approve — Draft -> Approved; Dr 5200 / Cr 2000. */
    public function approve(string $id): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;
        $bill = VendorBill::forTenant($tenantId)->findOrFail($id);

        if ($bill->status !== 'Draft') {
            return response()->json(['error' => 'Only a Draft bill can be approved.'], 422);
        }

        $bill->update(['status' => 'Approved']);

        try {
            $this->gl->postJournal([
                'tenantId' => $tenantId,
                'narration' => "Vendor bill {$bill->bill_number} — {$bill->vendor}",
                'reference' => "BILL-{$bill->bill_number}",
                'source' => 'vendorbill',
                'lines' => [
                    ['code' => '5200', 'debit' => (float) $bill->total], // Dr Operating Expense
                    ['code' => '2000', 'credit' => (float) $bill->total], // Cr Accounts Payable
                ],
            ]);
        } catch (Throwable $e) {
            Log::error('vendor bill approve journal failed', ['bill_id' => $bill->id, 'error' => $e->getMessage()]);
        }

        return response()->json($bill->fresh());
    }

    /** POST /api/finance/bills/{id}/pay — Approved -> Paid; Dr 2000 / Cr 1010. */
    public function pay(string $id): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;
        $bill = VendorBill::forTenant($tenantId)->findOrFail($id);

        if ($bill->status !== 'Approved') {
            return response()->json(['error' => 'Only an Approved bill can be paid.'], 422);
        }

        $bill->update(['status' => 'Paid']);

        try {
            $this->gl->postJournal([
                'tenantId' => $tenantId,
                'narration' => "Paid vendor bill {$bill->bill_number} — {$bill->vendor}",
                'reference' => "BILLPAY-{$bill->bill_number}",
                'source' => 'vendorbill',
                'lines' => [
                    ['code' => '2000', 'debit' => (float) $bill->total], // Dr Accounts Payable
                    ['code' => '1010', 'credit' => (float) $bill->total], // Cr Bank
                ],
            ]);
        } catch (Throwable $e) {
            Log::error('vendor bill pay journal failed', ['bill_id' => $bill->id, 'error' => $e->getMessage()]);
        }

        return response()->json($bill->fresh());
    }

    /** Attach vendor_bill_lines to a collection of VendorBill models via a single bulk query. */
    private function attachLines(\Illuminate\Support\Collection $bills): void
    {
        if ($bills->isEmpty()) {
            return;
        }
        $ids = $bills->pluck('id')->all();
        $lines = VendorBillLine::whereIn('vendor_bill_id', $ids)->get()->groupBy('vendor_bill_id');
        foreach ($bills as $bill) {
            $bill->setRelation('lines', $lines->get($bill->id, collect()));
        }
    }
}
