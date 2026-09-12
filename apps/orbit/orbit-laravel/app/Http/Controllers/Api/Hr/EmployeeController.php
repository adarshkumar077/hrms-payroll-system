<?php

namespace App\Http\Controllers\Api\Hr;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\SalaryStructure;
use App\Services\Compliance\PayrollService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Employee CRUD. On create, also provisions a compliant SalaryStructure
 * (basic/HRA/allowances split) via PayrollService::suggestStructure(ctc/12) —
 * mirrors app/(app)/hr/employees/actions.ts::addEmployee.
 */
class EmployeeController extends Controller
{
    /**
     * GET /api/hr/employees
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $query = Employee::query()->where('tenant_id', $tenantId);

        if ($search = $request->query('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($request->has('active')) {
            $query->where('active', $request->boolean('active'));
        }

        $employees = $query->orderBy('name')->paginate(
            (int) $request->query('per_page', 20)
        );

        return response()->json($employees);
    }

    /**
     * POST /api/hr/employees
     */
    public function store(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'string', 'email', 'max:255'],
            'department' => ['nullable', 'string', 'max:255'],
            'designation' => ['nullable', 'string', 'max:255'],
            'manager_id' => ['nullable', 'string'],
            'date_of_joining' => ['nullable', 'date'],
            'ctc' => ['required', 'numeric', 'gt:0'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $employee = DB::transaction(function () use ($data, $tenantId) {
            $count = Employee::where('tenant_id', $tenantId)->count();
            $code = 'EMP'.str_pad((string) ($count + 1), 4, '0', STR_PAD_LEFT);

            $employee = Employee::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'code' => $code,
                'name' => $data['name'],
                'email' => $data['email'] ?? null,
                'department' => $data['department'] ?? null,
                'designation' => $data['designation'] ?? null,
                'manager_id' => $data['manager_id'] ?? null,
                'date_of_joining' => $data['date_of_joining'] ?? now(),
                'ctc' => $data['ctc'],
                'active' => $data['active'] ?? true,
            ]);

            $gross = (float) $data['ctc'] / 12;
            $structure = PayrollService::suggestStructure($gross);

            SalaryStructure::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'employee_id' => $employee->id,
                'gross' => $structure['gross'],
                'basic' => $structure['basic'],
                'hra' => $structure['hra'],
                'allowances' => $structure['allowances'],
                'compliant' => $structure['compliant'],
            ]);

            return $employee;
        });

        $structure = SalaryStructure::where('employee_id', $employee->id)->first();

        return response()->json([
            'employee' => $employee,
            'salaryStructure' => $structure,
        ], 201);
    }

    /**
     * GET /api/hr/employees/{employee}
     */
    public function show(Request $request, string $employee): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $row = Employee::where('tenant_id', $tenantId)->where('id', $employee)->firstOrFail();
        $structure = SalaryStructure::where('tenant_id', $tenantId)->where('employee_id', $row->id)->first();

        return response()->json([
            'employee' => $row,
            'salaryStructure' => $structure,
        ]);
    }

    /**
     * PUT/PATCH /api/hr/employees/{employee}
     */
    public function update(Request $request, string $employee): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $row = Employee::where('tenant_id', $tenantId)->where('id', $employee)->firstOrFail();

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'nullable', 'string', 'email', 'max:255'],
            'department' => ['sometimes', 'nullable', 'string', 'max:255'],
            'designation' => ['sometimes', 'nullable', 'string', 'max:255'],
            'manager_id' => ['sometimes', 'nullable', 'string'],
            'date_of_joining' => ['sometimes', 'date'],
            'ctc' => ['sometimes', 'numeric', 'gt:0'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $row->fill($data);
        $row->save();

        // Keep the salary structure in sync when CTC changes, using the same
        // compliant-split rule applied at onboarding.
        if (array_key_exists('ctc', $data)) {
            $gross = (float) $data['ctc'] / 12;
            $structure = PayrollService::suggestStructure($gross);

            $existing = SalaryStructure::where('tenant_id', $tenantId)->where('employee_id', $row->id)->first();
            if ($existing) {
                $existing->update([
                    'gross' => $structure['gross'],
                    'basic' => $structure['basic'],
                    'hra' => $structure['hra'],
                    'allowances' => $structure['allowances'],
                    'compliant' => $structure['compliant'],
                ]);
            } else {
                SalaryStructure::create([
                    'id' => (string) Str::uuid(),
                    'tenant_id' => $tenantId,
                    'employee_id' => $row->id,
                    'gross' => $structure['gross'],
                    'basic' => $structure['basic'],
                    'hra' => $structure['hra'],
                    'allowances' => $structure['allowances'],
                    'compliant' => $structure['compliant'],
                ]);
            }
        }

        $structure = SalaryStructure::where('tenant_id', $tenantId)->where('employee_id', $row->id)->first();

        return response()->json([
            'employee' => $row,
            'salaryStructure' => $structure,
        ]);
    }

    /**
     * DELETE /api/hr/employees/{employee}
     */
    public function destroy(Request $request, string $employee): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $row = Employee::where('tenant_id', $tenantId)->where('id', $employee)->firstOrFail();

        SalaryStructure::where('tenant_id', $tenantId)->where('employee_id', $row->id)->delete();
        $row->delete();

        return response()->json(['message' => 'Employee deleted.']);
    }
}
