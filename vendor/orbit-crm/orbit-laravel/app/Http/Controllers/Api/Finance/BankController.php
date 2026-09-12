<?php

namespace App\Http\Controllers\Api\Finance;

use App\Http\Controllers\Controller;
use App\Models\BankTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Bank statement import + reconciliation. Ported from lib/bank.ts, minus CSV parsing —
 * this endpoint takes an already-parsed JSON array of rows (the client/UI owns turning a
 * pasted CSV into rows; parseBankCsv's column-sniffing is presentation-layer, not API).
 */
class BankController extends Controller
{
    /** GET /api/finance/bank/transactions */
    public function index(Request $request): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;

        $query = BankTransaction::forTenant($tenantId)->orderByDesc('date');

        if ($request->has('reconciled')) {
            $query->where('reconciled', filter_var($request->get('reconciled'), FILTER_VALIDATE_BOOLEAN));
        }
        if ($direction = $request->get('direction')) {
            $query->where('direction', $direction);
        }

        return response()->json($query->paginate((int) $request->get('per_page', 25)));
    }

    /**
     * POST /api/finance/bank/import
     * Body: { transactions: [{ date?, description?, amount, direction? }] }
     * direction defaults from the sign of amount (negative = debit) when omitted, mirroring
     * parseBankCsv's fallback; amount is stored as an absolute value.
     */
    public function import(Request $request): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;

        $data = $request->validate([
            'transactions' => ['required', 'array', 'min:1'],
            'transactions.*.date' => ['nullable', 'date'],
            'transactions.*.description' => ['nullable', 'string'],
            'transactions.*.amount' => ['required', 'numeric'],
            'transactions.*.direction' => ['nullable', 'string', 'in:credit,debit'],
        ]);

        $now = now();
        $rows = [];
        foreach ($data['transactions'] as $t) {
            $rawAmount = (float) $t['amount'];
            $amount = abs($rawAmount);
            if ($amount <= 0) {
                continue; // parity with parseBankCsv, which drops zero-amount rows
            }
            $direction = $t['direction'] ?? ($rawAmount < 0 ? 'debit' : 'credit');
            $rows[] = [
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'date' => $t['date'] ?? $now,
                'description' => $t['description'] ?? '',
                'amount' => $amount,
                'direction' => $direction,
                'reconciled' => false,
                'created_at' => $now,
            ];
        }

        if ($rows) {
            BankTransaction::insert($rows);
        }

        return response()->json(['imported' => count($rows)], 201);
    }

    /**
     * POST /api/finance/bank/transactions/{id}/reconcile
     * Body: { matched_type?, matched_id? }. reconciled = true when matched_id is present, or
     * matched_type === "manual" (mirrors lib/bank.ts reconcile()).
     */
    public function reconcile(Request $request, string $id): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;
        $txn = BankTransaction::forTenant($tenantId)->findOrFail($id);

        $data = $request->validate([
            'matched_type' => ['nullable', 'string', 'max:50'],
            'matched_id' => ['nullable', 'string'],
        ]);

        $matchedType = $data['matched_type'] ?? null;
        $matchedId = $data['matched_id'] ?? null;

        $txn->update([
            'reconciled' => (bool) $matchedId || $matchedType === 'manual',
            'matched_type' => $matchedType,
            'matched_id' => $matchedId,
        ]);

        return response()->json($txn->fresh());
    }

    /** POST /api/finance/bank/transactions/{id}/unreconcile — undo a reconciliation. */
    public function unreconcile(string $id): JsonResponse
    {
        $tenantId = auth()->user()->tenant_id;
        $txn = BankTransaction::forTenant($tenantId)->findOrFail($id);

        $txn->update(['reconciled' => false, 'matched_type' => null, 'matched_id' => null]);

        return response()->json($txn->fresh());
    }
}
