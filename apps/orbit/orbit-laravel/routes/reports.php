<?php

use App\Http\Controllers\Api\Finance\ReportController;
use Illuminate\Support\Facades\Route;

// Financial Reports API. Self-prefixes 'api' and guards with auth:sanctum, mirroring
// routes/ai.php — loaded via bootstrap/app.php's withRouting(then: ...) alongside
// hr.php/finance.php/ai.php (wiring owned by Director; this file is not touched there yet
// but slots in unchanged whichever way it ends up required).
Route::middleware(['auth:sanctum'])->prefix('api')->group(function () {
    Route::get('finance/reports', [ReportController::class, 'index']);
});
