<?php

namespace App\Services;

use App\Models\BackgroundJob;
use App\Models\Ticket;
use Illuminate\Support\Str;
use Throwable;

/**
 * Minimal background-job runner — ported 1:1 from lib/jobs.ts.
 *
 * Jobs are rows in the `background_jobs` table with a `run_at`. A real deploy
 * points a cron at `php artisan schedule:run` (registered in routes/console.php)
 * — or a secured HTTP endpoint guarded by CRON_SECRET — to call runDue().
 * Handlers are pure and idempotent-ish; add new ones to handlers().
 */
class JobRunner
{
    /** @return array<string, callable(BackgroundJob): string> */
    private static function handlers(): array
    {
        return [
            // Reminds the tenant a payroll run is due.
            'payroll.reminder' => function (BackgroundJob $job): string {
                if (! $job->tenant_id) {
                    return 'no tenant';
                }
                Notifier::notify(
                    $job->tenant_id,
                    null,
                    'reminder',
                    'Payroll due',
                    '/payroll',
                    "Run and lock this month's payroll before the 7th (TDS) / 15th (PF/ESI)."
                );

                return 'reminded';
            },

            // Flags tickets breaching SLA.
            'sla.ageing' => function (BackgroundJob $job): string {
                if (! $job->tenant_id) {
                    return 'no tenant';
                }
                $breached = Ticket::forTenant($job->tenant_id)
                    ->whereIn('status', ['Open', 'InProgress'])
                    ->where('sla_due_at', '<', now())
                    ->count();
                if ($breached > 0) {
                    Notifier::notify($job->tenant_id, null, 'alert', "{$breached} ticket(s) breaching SLA", '/tickets');
                }

                return "breached={$breached}";
            },

            // Compliance calendar heads-up.
            'compliance.reminder' => function (BackgroundJob $job): string {
                if (! $job->tenant_id) {
                    return 'no tenant';
                }
                Notifier::notify(
                    $job->tenant_id,
                    null,
                    'reminder',
                    'GST filing due',
                    '/finance/invoices',
                    'GSTR-1 by the 11th. Draft auto-prepared from finalized invoices.'
                );

                return 'reminded';
            },
        ];
    }

    /** @return string[] */
    public static function jobTypes(): array
    {
        return array_keys(self::handlers());
    }

    public static function scheduleJob(string $type, \DateTimeInterface $runAt, ?string $tenantId = null, array $payload = []): BackgroundJob
    {
        return BackgroundJob::create([
            'id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'type' => $type,
            'run_at' => $runAt,
            'status' => 'pending',
            'payload' => json_encode($payload),
        ]);
    }

    /**
     * Claim and run all due jobs (status=pending, run_at <= now), atomically.
     *
     * @return array{ran: int, results: array<int, array<string, mixed>>}
     */
    public static function runDue(): array
    {
        $due = BackgroundJob::where('status', 'pending')->where('run_at', '<=', now())->take(50)->get();
        $handlers = self::handlers();
        $results = [];

        foreach ($due as $job) {
            // Claim the job atomically before running it. If two cron hits race
            // on the same job, only the update that actually flips
            // pending -> running (affected === 1) proceeds; the loser skips it.
            $claimed = BackgroundJob::where('id', $job->id)->where('status', 'pending')->update(['status' => 'running']);
            if ($claimed !== 1) {
                $results[] = ['id' => $job->id, 'type' => $job->type, 'result' => 'skipped (already claimed)'];

                continue;
            }

            $handler = $handlers[$job->type] ?? null;
            try {
                $result = $handler ? $handler($job) : 'no handler';
                $job->update(['status' => $handler ? 'done' : 'failed', 'result' => $result]);
                $results[] = ['id' => $job->id, 'type' => $job->type, 'result' => $result];
            } catch (Throwable $e) {
                $job->update(['status' => 'failed', 'result' => $e->getMessage()]);
                $results[] = ['id' => $job->id, 'type' => $job->type, 'error' => $e->getMessage()];
            }
        }

        return ['ran' => $due->count(), 'results' => $results];
    }
}
