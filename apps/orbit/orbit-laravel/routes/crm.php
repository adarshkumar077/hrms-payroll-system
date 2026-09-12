<?php

use App\Http\Controllers\Api\Crm\AccountController;
use App\Http\Controllers\Api\Crm\ActivityController;
use App\Http\Controllers\Api\Crm\ContactController;
use App\Http\Controllers\Api\Crm\LeadController;
use App\Http\Controllers\Api\Crm\OpportunityController;
use App\Http\Controllers\Api\Crm\QuotationController;
use App\Http\Controllers\Api\Crm\TicketController;
use Illuminate\Support\Facades\Route;

/**
 * CRM API Routes — all protected by auth:sanctum
 * Mounted at /api via routes/api.php
 */

Route::middleware('auth:sanctum')->prefix('crm')->group(function () {
    // Leads — CRUD + score action
    Route::apiResource('leads', LeadController::class);
    Route::post('/leads/{id}/score', [LeadController::class, 'score']);

    // Accounts — CRUD
    Route::apiResource('accounts', AccountController::class);

    // Contacts — CRUD
    Route::apiResource('contacts', ContactController::class);

    // Opportunities — CRUD + advance action
    Route::apiResource('opportunities', OpportunityController::class);
    Route::post('/opportunities/{id}/advance', [OpportunityController::class, 'advance']);

    // Quotations — CRUD
    Route::apiResource('quotations', QuotationController::class);

    // Tickets — CRUD + status action
    Route::apiResource('tickets', TicketController::class);
    Route::patch('/tickets/{id}/status', [TicketController::class, 'status']);

    // Activities — CRUD
    Route::apiResource('activities', ActivityController::class);
});
