<?php

use App\Http\Controllers\Api\SettingsController;
use Illuminate\Support\Facades\Route;

// Profile + Team management API. Loaded via bootstrap/app.php's withRouting(then: ...)
// so routes/api.php stays untouched. All endpoints require an authenticated user;
// team/role write endpoints additionally require the caller to be the tenant CEO
// (enforced in the controller).
Route::middleware(['auth:sanctum'])->prefix('api')->group(function () {
    Route::patch('profile', [SettingsController::class, 'updateProfile']);
    Route::post('change-password', [SettingsController::class, 'changePassword']);

    Route::get('team', [SettingsController::class, 'teamIndex']);
    Route::post('team', [SettingsController::class, 'teamStore']);
    Route::patch('team/{id}', [SettingsController::class, 'teamUpdate']);

    Route::get('roles', [SettingsController::class, 'rolesIndex']);
    Route::post('roles', [SettingsController::class, 'rolesStore']);

    Route::post('2fa/begin', [SettingsController::class, 'twoFactorBegin']);
    Route::post('2fa/confirm', [SettingsController::class, 'twoFactorConfirm']);
    Route::post('2fa/disable', [SettingsController::class, 'twoFactorDisable']);
});
