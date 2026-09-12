<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * List + today's summary — mirrors the "Today's Attendance" section of
 * app/(app)/hr/leave/page.tsx.
 */
class AttendanceController extends Controller
{
    /**
     * GET /api/hr/attendance
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $query = Attendance::query()->where('tenant_id', $tenantId);

        if ($employeeId = $request->query('employee_id')) {
            $query->where('employee_id', $employeeId);
        }

        if ($from = $request->query('from')) {
            $query->where('date', '>=', Carbon::parse($from)->startOfDay());
        }

        if ($to = $request->query('to')) {
            $query->where('date', '<=', Carbon::parse($to)->endOfDay());
        }

        $records = $query->orderByDesc('date')
            ->paginate((int) $request->query('per_page', 50));

        $records->getCollection()->transform(fn (Attendance $a) => $this->withEmployee($a, $tenantId));

        return response()->json($records);
    }

    /**
     * GET /api/hr/attendance/today — status counts + today's rows, scoped to tenant.
     */
    public function today(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $start = Carbon::now()->startOfDay();
        $end = (clone $start)->addDay();

        $rows = Attendance::where('tenant_id', $tenantId)
            ->where('date', '>=', $start)
            ->where('date', '<', $end)
            ->orderBy('check_in')
            ->get();

        $rows = $rows->map(fn (Attendance $a) => $this->withEmployee($a, $tenantId));

        $summary = [
            'present' => $rows->where('status', 'Present')->count(),
            'halfDay' => $rows->where('status', 'HalfDay')->count(),
            'onLeave' => $rows->where('status', 'Leave')->count(),
            'absent' => $rows->where('status', 'Absent')->count(),
            'weekOff' => $rows->where('status', 'WeekOff')->count(),
            'total' => $rows->count(),
        ];

        return response()->json([
            'date' => $start->toDateString(),
            'summary' => $summary,
            'records' => $rows->values(),
        ]);
    }

    private function withEmployee(Attendance $attendance, string $tenantId): Attendance
    {
        $employee = Employee::where('tenant_id', $tenantId)
            ->where('id', $attendance->employee_id)
            ->first(['id', 'name', 'code']);

        $attendance->setAttribute('employee', $employee ? [
            'id' => $employee->id,
            'name' => $employee->name,
            'code' => $employee->code,
        ] : null);

        return $attendance;
    }
}
