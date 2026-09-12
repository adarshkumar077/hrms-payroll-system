<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\Invoice;
use App\Models\Item;
use App\Models\Lead;
use App\Models\Opportunity;
use App\Models\PayrollRun;
use App\Models\Ticket;
use GuzzleHttp\Client;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Orbit — "Chat with your data" NL Copilot. Ported 1:1 from lib/copilot.ts.
 *
 * Design law (safety): the LLM NEVER writes SQL. It only *classifies* a free-text
 * question into one of a FIXED set of intents. Our own code then runs the
 * corresponding tenant-scoped Eloquent aggregation and formats a natural-language
 * answer. The DB surface is always this curated allow-list.
 *
 * The classifier calls the same OpenAI-compatible endpoint as AiService
 * (LLM_BASE_URL / LLM_API_KEY / LLM_MODEL). If that's unset or fails, it degrades
 * to deterministic keyword matching — the copilot is ALWAYS demoable.
 */
class Copilot
{
    /** @var string[] */
    public const INTENTS = [
        'revenue_won',
        'cash_position',
        'receivables_outstanding',
        'pipeline_by_stage',
        'top_opportunities',
        'open_leads_count',
        'leads_by_source',
        'headcount',
        'payroll_liability',
        'low_stock_items',
        'gst_tax_collected',
        'open_tickets',
        'unknown',
    ];

    /** Human-readable one-liners — used for the classifier prompt AND as UI hints. */
    public const INTENT_HELP = [
        'revenue_won' => 'Total revenue from closed-won opportunities',
        'cash_position' => 'Cash actually collected (paid invoices)',
        'receivables_outstanding' => 'Money owed by customers (unpaid invoices)',
        'pipeline_by_stage' => 'Open pipeline value grouped by deal stage',
        'top_opportunities' => 'Largest open opportunities by amount',
        'open_leads_count' => 'How many leads are still open (not converted/dead)',
        'leads_by_source' => 'Lead counts broken down by acquisition source',
        'headcount' => 'Number of active employees',
        'payroll_liability' => 'Monthly payroll cost from the latest run',
        'low_stock_items' => 'Inventory items at or below their reorder level',
        'gst_tax_collected' => 'GST tax collected on finalized/paid invoices',
        'open_tickets' => 'Support tickets that are open or in progress',
        'unknown' => 'Question not understood',
    ];

    /**
     * Public entry point.
     *
     * @return array{answer: string, data?: mixed, intent: string, source: 'model'|'fallback'}
     */
    public static function ask(string $tenantId, string $question): array
    {
        $clean = trim($question);
        if ($clean === '') {
            return ['answer' => 'Ask me a question about your business data.', 'intent' => 'unknown', 'source' => 'fallback'];
        }

        $intent = null;
        $source = 'fallback';

        try {
            $classified = self::classifyWithLlm($clean);
            if ($classified !== null && $classified !== 'unknown') {
                $intent = $classified;
                $source = 'model';
            }
        } catch (Throwable $e) {
            // fall through to keyword matching
        }

        if ($intent === null) {
            $intent = self::keywordIntent($clean);
            $source = 'fallback';
        }

        $result = self::runIntent($tenantId, $intent);

        return array_merge($result, ['source' => $source]);
    }

    /**
     * Deterministic fallback: keyword-match the question to an intent.
     * Pure function, no network/DB — always available.
     */
    public static function keywordIntent(string $question): string
    {
        $q = strtolower($question);
        $has = fn (string ...$ws): bool => (bool) array_filter($ws, fn ($w) => str_contains($q, $w));

        if ($has('receivable', 'owed', 'outstanding', 'unpaid', 'collect from', 'pending payment')) {
            return 'receivables_outstanding';
        }
        if ($has('cash', 'collected', 'in the bank', 'cash position', 'money in')) {
            return 'cash_position';
        }
        if ($has('revenue', 'won', 'closed won', 'sales closed', 'booked')) {
            return 'revenue_won';
        }
        if ($has('pipeline', 'by stage', 'funnel', 'stages')) {
            return 'pipeline_by_stage';
        }
        if ($has('top opportunit', 'biggest deal', 'largest deal', 'top deal', 'biggest opportunit')) {
            return 'top_opportunities';
        }
        if (str_contains($q, 'lead') && $has('source', 'channel', 'where', 'come from')) {
            return 'leads_by_source';
        }
        if (str_contains($q, 'lead')) {
            return 'open_leads_count';
        }
        if ($has('headcount', 'how many employee', 'team size', 'staff', 'employees')) {
            return 'headcount';
        }
        if ($has('payroll', 'salary cost', 'wage bill', 'payslip')) {
            return 'payroll_liability';
        }
        if ($has('low stock', 'reorder', 'stock out', 'running low', 'inventory low', 'restock')) {
            return 'low_stock_items';
        }
        if ($has('gst', 'tax collected', 'tax', 'cgst', 'sgst', 'igst')) {
            return 'gst_tax_collected';
        }
        if ($has('ticket', 'support', 'complaint')) {
            return 'open_tickets';
        }

        return 'unknown';
    }

    /** Ask the LLM to classify -> intent. Throws on any problem so the caller falls back to keywords. */
    private static function classifyWithLlm(string $question): ?string
    {
        if (! env('LLM_BASE_URL') || ! env('LLM_API_KEY')) {
            return null;
        }

        $system = 'You classify a business question into exactly ONE intent for an Indian SMB business OS. '
            .'Respond with ONLY compact JSON: {"intent":"<one of the list>"}. No prose, no markdown. '
            .'Use "unknown" if nothing fits. Intents: '
            .implode('; ', array_map(fn ($i) => "{$i} (".self::INTENT_HELP[$i].')', self::INTENTS)).'.';

        $client = new Client(['timeout' => 15]);
        $base = rtrim((string) env('LLM_BASE_URL'), '/');

        $res = $client->post($base.'/chat/completions', [
            'headers' => [
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer '.env('LLM_API_KEY'),
            ],
            'json' => [
                'model' => env('LLM_MODEL', 'llama-3.3-70b-versatile'),
                'messages' => [
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user', 'content' => $question],
                ],
                'max_tokens' => 80,
                'temperature' => 0,
            ],
        ]);

        $data = json_decode((string) $res->getBody(), true);
        $txt = $data['choices'][0]['message']['content'] ?? '';

        if (! preg_match('/\{[\s\S]*\}/', $txt, $m)) {
            return null;
        }

        $parsed = json_decode($m[0], true);
        $intent = is_array($parsed) ? ($parsed['intent'] ?? null) : null;

        return in_array($intent, self::INTENTS, true) ? $intent : 'unknown';
    }

    /**
     * Intent -> tenant-scoped Eloquent query -> answer.
     * `source` is attached by the caller (ask()) — it reflects how the intent was
     * classified, not this per-intent lookup.
     *
     * @return array{intent: string, data?: mixed, answer: string}
     */
    private static function runIntent(string $t, string $intent): array
    {
        switch ($intent) {
            case 'revenue_won': {
                $total = (float) Opportunity::forTenant($t)->where('stage', 'ClosedWon')->sum('amount');
                $deals = Opportunity::forTenant($t)->where('stage', 'ClosedWon')->count();

                return [
                    'intent' => $intent,
                    'data' => ['total' => $total, 'deals' => $deals],
                    'answer' => sprintf("You've won %s in revenue across %d closed-won %s.", self::inrLakh($total), $deals, $deals === 1 ? 'deal' : 'deals'),
                ];
            }

            case 'cash_position': {
                $cash = (float) Invoice::forTenant($t)->where('status', 'Paid')->sum('grand_total');
                $paidInvoices = Invoice::forTenant($t)->where('status', 'Paid')->count();

                return [
                    'intent' => $intent,
                    'data' => ['cash' => $cash, 'paidInvoices' => $paidInvoices],
                    'answer' => sprintf('Your cash position is %s, collected from %d paid %s.', self::inrLakh($cash), $paidInvoices, $paidInvoices === 1 ? 'invoice' : 'invoices'),
                ];
            }

            case 'receivables_outstanding': {
                $owed = (float) Invoice::forTenant($t)->whereIn('status', ['Draft', 'Finalized'])->sum('grand_total');
                $invoices = Invoice::forTenant($t)->whereIn('status', ['Draft', 'Finalized'])->count();

                return [
                    'intent' => $intent,
                    'data' => ['outstanding' => $owed, 'invoices' => $invoices],
                    'answer' => sprintf('You have %s in outstanding receivables across %d unpaid %s.', self::inrLakh($owed), $invoices, $invoices === 1 ? 'invoice' : 'invoices'),
                ];
            }

            case 'pipeline_by_stage': {
                $rows = Opportunity::forTenant($t)
                    ->select('stage', DB::raw('SUM(amount) as amount_sum'), DB::raw('COUNT(*) as row_count'))
                    ->groupBy('stage')
                    ->get()
                    ->keyBy('stage');

                $order = ['Qualification', 'Proposal', 'Negotiation', 'ClosedWon', 'ClosedLost'];
                $stages = [];
                foreach ($order as $st) {
                    $r = $rows->get($st);
                    $count = $r ? (int) $r->row_count : 0;
                    if ($count === 0) {
                        continue;
                    }
                    $stages[] = ['stage' => $st, 'amount' => $r ? (float) $r->amount_sum : 0.0, 'count' => $count];
                }

                $openValue = array_sum(array_map(
                    fn ($s) => $s['amount'],
                    array_filter($stages, fn ($s) => in_array($s['stage'], ['Qualification', 'Proposal', 'Negotiation'], true))
                ));

                $summary = implode(' · ', array_map(fn ($s) => "{$s['stage']}: ".self::inrLakh($s['amount'])." ({$s['count']})", $stages));

                return [
                    'intent' => $intent,
                    'data' => ['stages' => $stages],
                    'answer' => "Open pipeline is ".self::inrLakh($openValue).". {$summary}.",
                ];
            }

            case 'top_opportunities': {
                $rows = Opportunity::forTenant($t)
                    ->whereIn('stage', ['Qualification', 'Proposal', 'Negotiation'])
                    ->orderByDesc('amount')
                    ->take(5)
                    ->get(['id', 'name', 'amount', 'stage', 'probability']);

                if ($rows->isEmpty()) {
                    return ['intent' => $intent, 'data' => ['rows' => []], 'answer' => 'No open opportunities right now.'];
                }

                $list = $rows->map(fn ($r) => "{$r->name} (".self::inrLakh((float) $r->amount).", {$r->stage})")->implode(', ');

                return [
                    'intent' => $intent,
                    'data' => ['rows' => $rows],
                    'answer' => sprintf('Your top %d open %s: %s.', $rows->count(), $rows->count() === 1 ? 'opportunity is' : 'opportunities are', $list),
                ];
            }

            case 'open_leads_count': {
                $open = Lead::forTenant($t)->whereNotIn('status', ['Converted', 'Dead'])->count();
                $total = Lead::forTenant($t)->count();

                return [
                    'intent' => $intent,
                    'data' => ['open' => $open, 'total' => $total],
                    'answer' => sprintf('You have %d open %s (out of %d total) still to work.', $open, $open === 1 ? 'lead' : 'leads', $total),
                ];
            }

            case 'leads_by_source': {
                $rows = Lead::forTenant($t)
                    ->select('source', DB::raw('COUNT(*) as row_count'))
                    ->groupBy('source')
                    ->get()
                    ->map(fn ($r) => ['source' => $r->source, 'count' => (int) $r->row_count])
                    ->sortByDesc('count')
                    ->values();

                if ($rows->isEmpty()) {
                    return ['intent' => $intent, 'data' => ['sources' => []], 'answer' => 'No leads yet.'];
                }

                $summary = $rows->map(fn ($s) => "{$s['source']}: {$s['count']}")->implode(', ');

                return [
                    'intent' => $intent,
                    'data' => ['sources' => $rows],
                    'answer' => "Leads by source — {$summary}.",
                ];
            }

            case 'headcount': {
                $count = Employee::forTenant($t)->where('active', true)->count();

                return [
                    'intent' => $intent,
                    'data' => ['headcount' => $count],
                    'answer' => sprintf('You have %d active %s on the payroll.', $count, $count === 1 ? 'employee' : 'employees'),
                ];
            }

            case 'payroll_liability': {
                $run = PayrollRun::forTenant($t)->orderByDesc('created_at')->first();
                if (! $run) {
                    return ['intent' => $intent, 'data' => null, 'answer' => 'No payroll run has been created yet.'];
                }

                $liability = (float) $run->net_total + (float) $run->pf_total + (float) $run->esi_total;

                return [
                    'intent' => $intent,
                    'data' => ['month' => $run->month, 'year' => $run->year, 'net' => $run->net_total, 'pf' => $run->pf_total, 'esi' => $run->esi_total, 'liability' => $liability],
                    'answer' => sprintf(
                        'Your latest payroll liability (%d/%d) is %s — net pay %s + PF %s + ESI %s.',
                        $run->month,
                        $run->year,
                        self::inrLakh($liability),
                        self::inrLakh((float) $run->net_total),
                        self::inr((float) $run->pf_total),
                        self::inr((float) $run->esi_total)
                    ),
                ];
            }

            case 'low_stock_items': {
                $low = Item::forTenant($t)
                    ->whereColumn('on_hand', '<=', 'reorder_level')
                    ->orderBy('on_hand')
                    ->get(['id', 'name', 'sku', 'on_hand', 'reorder_level', 'uom']);

                if ($low->isEmpty()) {
                    return ['intent' => $intent, 'data' => ['low' => []], 'answer' => 'All items are above their reorder level — no restocking needed.'];
                }

                $summary = $low->map(fn ($i) => "{$i->name} ({$i->on_hand}/{$i->reorder_level} {$i->uom})")->implode(', ');

                return [
                    'intent' => $intent,
                    'data' => ['low' => $low],
                    'answer' => sprintf('%d %s at or below reorder level: %s.', $low->count(), $low->count() === 1 ? 'item is' : 'items are', $summary),
                ];
            }

            case 'gst_tax_collected': {
                $agg = Invoice::forTenant($t)
                    ->whereIn('status', ['Finalized', 'Paid'])
                    ->selectRaw('SUM(cgst) as cgst_sum, SUM(sgst) as sgst_sum, SUM(igst) as igst_sum')
                    ->first();

                $cgst = (float) ($agg->cgst_sum ?? 0);
                $sgst = (float) ($agg->sgst_sum ?? 0);
                $igst = (float) ($agg->igst_sum ?? 0);
                $total = $cgst + $sgst + $igst;

                return [
                    'intent' => $intent,
                    'data' => ['cgst' => $cgst, 'sgst' => $sgst, 'igst' => $igst, 'total' => $total],
                    'answer' => sprintf(
                        'GST collected on finalized/paid invoices is %s — CGST %s, SGST %s, IGST %s.',
                        self::inrLakh($total),
                        self::inr($cgst),
                        self::inr($sgst),
                        self::inr($igst)
                    ),
                ];
            }

            case 'open_tickets': {
                $rows = Ticket::forTenant($t)
                    ->whereIn('status', ['Open', 'InProgress'])
                    ->select('priority', DB::raw('COUNT(*) as row_count'))
                    ->groupBy('priority')
                    ->get()
                    ->map(fn ($r) => ['priority' => $r->priority, 'count' => (int) $r->row_count])
                    ->sortByDesc('count')
                    ->values();

                $total = $rows->sum('count');

                if ($total === 0) {
                    return ['intent' => $intent, 'data' => ['total' => 0, 'byPriority' => []], 'answer' => 'No open tickets — support queue is clear.'];
                }

                $summary = $rows->map(fn ($p) => "{$p['priority']}: {$p['count']}")->implode(', ');

                return [
                    'intent' => $intent,
                    'data' => ['total' => $total, 'byPriority' => $rows],
                    'answer' => sprintf('You have %d open %s (%s).', $total, $total === 1 ? 'ticket' : 'tickets', $summary),
                ];
            }

            default:
                return [
                    'intent' => 'unknown',
                    'answer' => "I couldn't map that to a known metric. Try asking about revenue, cash position, receivables, pipeline, top opportunities, open leads, leads by source, headcount, payroll, low stock, GST collected, or open tickets.",
                ];
        }
    }

    // ── Indian-locale currency formatting (mirrors lib/format.ts inr/inrLakh) ──

    private static function inr(float $n): string
    {
        return '₹'.self::indianGroup((int) round($n ?: 0));
    }

    private static function inrLakh(float $n): string
    {
        if ($n >= 10000000) {
            return '₹'.number_format($n / 10000000, 2).' Cr';
        }
        if ($n >= 100000) {
            return '₹'.number_format($n / 100000, 2).' L';
        }

        return self::inr($n);
    }

    private static function indianGroup(int $n): string
    {
        $neg = $n < 0;
        $s = (string) abs($n);
        if (strlen($s) > 3) {
            $last3 = substr($s, -3);
            $rest = substr($s, 0, -3);
            $rest = preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest);
            $s = $rest.','.$last3;
        }

        return ($neg ? '-' : '').$s;
    }
}
