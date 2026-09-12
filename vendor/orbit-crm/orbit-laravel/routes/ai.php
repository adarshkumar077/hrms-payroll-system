<?php

use App\Http\Controllers\Api\AiController;
use App\Http\Controllers\Api\CopilotController;
use Illuminate\Support\Facades\Route;

// AI Console + Copilot API. Loaded via bootstrap/app.php's withRouting(then: ...)
// so routes/api.php stays untouched. Both AiService and Copilot degrade to a
// deterministic local fallback with no LLM key configured — always demoable.
Route::middleware(['auth:sanctum'])->prefix('api')->group(function () {
    Route::get('ai/status', [AiController::class, 'status']);
    Route::post('ai/score-all', [AiController::class, 'scoreAll']);
    Route::post('ai/draft', [AiController::class, 'draft']);
    Route::post('ai/summarize', [AiController::class, 'summarize']);

    Route::post('copilot/ask', [CopilotController::class, 'ask']);
});
