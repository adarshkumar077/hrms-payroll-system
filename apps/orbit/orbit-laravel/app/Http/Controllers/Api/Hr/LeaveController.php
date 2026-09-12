<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveApplication;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * List + approve/reject leave applications — mirrors app/(app)/hr/leave/{page.tsx,actions.ts}.
 */
class LeaveController extends Controller
{
    /**
     * GET /api/hr/leave
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $query = LeaveApplication::query()->where('tenant_id', $tenantId);

        if ($employeeId = $request->query('employee_id')) {
            $query->where('employee_id', $employeeId);
        }

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        $leaves = $query->orderBy('status')->orderByDesc('created_at')
            ->paginate((int) $request->query('per_page', 50));

        // No relation is defined between LeaveApplication and Employee, so
        // resolve employee names/codes with a single batch lookup.
        $employeeIds = collect($leaves->items())->pluck('employee_id')->unique()->values();
        $employees = Employee::where('tenant_id', $tenantId)
            ->whereIn('id', $employeeIds)
            ->get(['id', 'name', 'code'])
            ->keyBy('id');

        $leaves->getCollection()->transform(function (LeaveApplication $leave) use ($employees) {
            $employee = $employees->get($leave->employee_id);
            $leave->setAttribute('employee', $employee ? [
                'id' => $employee->id,
                'name' => $employee->name,
                'code' => $employee->code,
            ] : null);

            return $leave;
        });

        return response()->json($leaves);
    }

    /**
     * POST /api/hr/leave/{leave}/approve
     */
    public function approve(Request $request, string $leave): JsonResponse
    {
        return $this->setStatus($request, $leave, 'Approved');
    }

    /**
     * POST /api/hr/leave/{leave}/reject
     */
    public function reject(Request $request, string $leave): JsonResponse
    {
        return $this->setStatus($request, $leave, 'Rejected');
    }

    private function setStatus(Request $request, string $leaveId, string $status): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $leave = LeaveApplication::where('tenant_id', $tenantId)
            ->where('id', $leaveId)
            ->where('status', 'Pending')
            ->first();

        if (! $leave) {
            return response()->json(['message' => 'Leave application not found or not pending.'], 404);
        }

        $leave->update(['status' => $status]);

        return response()->json($leave);
    }
}
