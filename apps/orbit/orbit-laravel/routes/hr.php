<?php

use App\Http\Controllers\Api\Hr\AttendanceController;
use App\Http\Controllers\Api\Hr\EmployeeController;
use App\Http\Controllers\Api\Hr\LeaveController;
use App\Http\Controllers\Api\Payroll\PayrollRunController;
use Illuminate\Support\Facades\Route;

// HR + Payroll REST API. Loaded via bootstrap/app.php's withRouting(then: ...)
// so routes/api.php stays untouched. All routes require a Sanctum token and
// are tenant-scoped inside the controllers.
Route::middleware('auth:sanctum')->prefix('api')->group(function () {
    // --- HR: Employees ---
    Route::get('hr/employees', [EmployeeController::class, 'index']);
    Route::post('hr/employees', [EmployeeController::class, 'store']);
    Route::get('hr/employees/{employee}', [EmployeeController::class, 'show']);
    Route::put('hr/employees/{employee}', [EmployeeController::class, 'update']);
    Route::patch('hr/employees/{employee}', [EmployeeController::class, 'update']);
    Route::delete('hr/employees/{employee}', [EmployeeController::class, 'destroy']);

    // --- HR: Leave ---
    Route::get('hr/leave', [LeaveController::class, 'index']);
    Route::post('hr/leave/{leave}/approve', [LeaveController::class, 'approve']);
    Route::post('hr/leave/{leave}/reject', [LeaveController::class, 'reject']);

    // --- HR: Attendance ---
    Route::get('hr/attendance/today', [AttendanceController::class, 'today']);
    Route::get('hr/attendance', [AttendanceController::class, 'index']);

    // --- Payroll runs ---
    Route::get('payroll/runs', [PayrollRunController::class, 'index']);
    Route::post('payroll/runs/run', [PayrollRunController::class, 'run']);
    Route::get('payroll/runs/{run}', [PayrollRunController::class, 'show']);
    Route::post('payroll/runs/{run}/lock', [PayrollRunController::class, 'lock']);
    Route::post('payroll/runs/{run}/pay', [PayrollRunController::class, 'pay']);
});
