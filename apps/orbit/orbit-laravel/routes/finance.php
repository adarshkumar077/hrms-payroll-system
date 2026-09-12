<?php

use App\Http\Controllers\Api\Finance\BankController;
use App\Http\Controllers\Api\Finance\InvoiceController;
use App\Http\Controllers\Api\Finance\VendorBillController;
use Illuminate\Support\Facades\Route;

// Finance module API routes (GST invoices, payments, vendor bills/AP, bank).
// Not currently required by bootstrap/app.php (only routes/api.php, web.php, console.php are
// wired via ->withRouting()) — same as the not-yet-wired routes/Api/Crm/* controllers. This
// file is self-prefixed with 'api' so it slots in unchanged whichever way it ends up loaded
// (e.g. a `then:` callback in bootstrap/app.php, or a `require` from routes/api.php).
Route::middleware('auth:sanctum')->prefix('api')->group(function () {
    Route::prefix('finance')->group(function () {
        // GST sales invoices
        Route::get('invoices', [InvoiceController::class, 'index']);
        Route::post('invoices', [InvoiceController::class, 'store']);
        Route::get('invoices/{id}', [InvoiceController::class, 'show']);
        Route::post('invoices/{id}/finalize', [InvoiceController::class, 'finalize']);
        Route::post('invoices/{id}/payments', [InvoiceController::class, 'recordPayment']);

        // Vendor bills / Accounts Payable
        Route::get('bills', [VendorBillController::class, 'index']);
        Route::post('bills', [VendorBillController::class, 'store']);
        Route::get('bills/{id}', [VendorBillController::class, 'show']);
        Route::post('bills/{id}/approve', [VendorBillController::class, 'approve']);
        Route::post('bills/{id}/pay', [VendorBillController::class, 'pay']);

        // Bank import + reconciliation
        Route::get('bank/transactions', [BankController::class, 'index']);
        Route::post('bank/import', [BankController::class, 'import']);
        Route::post('bank/transactions/{id}/reconcile', [BankController::class, 'reconcile']);
        Route::post('bank/transactions/{id}/unreconcile', [BankController::class, 'unreconcile']);
    });
});
