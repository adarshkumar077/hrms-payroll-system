<?php

use App\Http\Controllers\Api\AuthController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Rate-limited to blunt credential-stuffing / brute force (see the 'login'
// limiter in AppServiceProvider — disabled under the testing env).
Route::post('/auth/signup', [AuthController::class, 'signup'])->middleware('throttle:login');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);

    Route::get('/user', function (Request $request) {
        return $request->user();
    });
});

// Module route files that self-prefix their module name (no 'api' prefix) are
// required here so they inherit api.php's /api context. Files that self-prefix
// 'api' (hr, finance) load standalone in bootstrap/app.php's then() callback.
require __DIR__.'/crm.php';
require __DIR__.'/inventory.php';
