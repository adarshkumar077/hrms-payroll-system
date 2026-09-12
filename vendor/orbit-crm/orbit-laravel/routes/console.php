<?php

use App\Services\JobRunner;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Background-job runner (payroll.reminder / sla.ageing / compliance.reminder — see
// App\Services\JobRunner). Claims and runs any BackgroundJob rows whose run_at is due.
//
// In production, point a real OS cron at `php artisan schedule:run` every minute —
// Laravel's scheduler will then invoke this entry on schedule. (Alternatively, expose
// a secured HTTP endpoint — e.g. POST /api/cron guarded by a CRON_SECRET bearer check,
// mirroring lib/jobs.ts's `POST /api/cron` — that calls JobRunner::runDue() directly for
// hosts without cron access.)
Schedule::call(fn () => JobRunner::runDue())->everyMinute()->name('jobs:run-due')->withoutOverlapping();
