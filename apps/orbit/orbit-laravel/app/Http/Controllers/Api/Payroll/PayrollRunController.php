<?php

namespace App\Http\Controllers\Api\Payroll;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Payslip;
use App\Models\PayrollRun;
use App\Models\SalaryStructure;
use App\Services\Compliance\PayrollService;
use App\Services\Rbac;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Payroll run lifecycle: Draft -> Locked -> Paid.
 * Mirrors app/(app)/payroll/{page.tsx,actions.ts,[id]/page.tsx}. All maths is
 * delegated to PayrollService::computePayslip() — do not reimplement it here.
 */
class PayrollRunController extends Controller
{
    /**
     * GET /api/payroll/runs
     */
    public function index(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $runs = PayrollRun::where('tenant_id', $tenantId)
            ->orderByDesc('year')
            ->orderByDesc('month')
            ->get();

        return response()->json($runs);
    }

    /**
     * POST /api/payroll/runs/run — draft a run for the next unrun month, one
     * payslip per SalaryStructure, totals aggregated onto the run.
     */
    public function run(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $structures = SalaryStructure::where('tenant_id', $tenantId)->get();

        if ($structures->isEmpty()) {
            return response()->json(['message' => 'No salary structures found for this tenant.'], 422);
        }

        $lastRun = PayrollRun::where('tenant_id', $tenantId)
            ->orderByDesc('year')
            ->orderByDesc('month')
            ->first(['month', 'year']);

        $last = $lastRun ? ['month' => $lastRun->month, 'year' => $lastRun->year] : null;

        [$month, $year] = $this->nextPeriod($last);

        $run = DB::transaction(function () use ($structures, $tenantId, $month, $year) {
            $run = PayrollRun::create([
                'id' => (string) Str::uuid(),
                'tenant_id' => $tenantId,
                'month' => $month,
                'year' => $year,
                'status' => 'Draft',
                'gross_total' => 0,
                'net_total' => 0,
                'pf_total' => 0,
                'esi_total' => 0,
                'tds_total' => 0,
            ]);

            $totals = ['gross' => 0.0, 'net' => 0.0, 'pf' => 0.0, 'esi' => 0.0, 'tds' => 0.0];

            foreach ($structures as $structure) {
                $calc = PayrollService::computePayslip([
                    'gross' => (float) $structure->gross,
                    'basic' => (float) $structure->basic,
                    'annualGross' => (float) $structure->gross * 12,
                ]);

                Payslip::create([
                    'id' => (string) Str::uuid(),
                    'payroll_run_id' => $run->id,
                    'employee_id' => $structure->employee_id,
                    'gross' => $calc['gross'],
                    'basic' => $calc['basic'],
                    'pf_employee' => $calc['pfEmployee'],
                    'pf_employer' => $calc['pfEmployer'],
                    'esi_employee' => $calc['esiEmployee'],
                    'esi_employer' => $calc['esiEmployer'],
                    'pt' => $calc['pt'],
                    'tds' => $calc['tds'],
                    'loss_of_pay' => $calc['lossOfPay'],
                    'net_pay' => $calc['netPay'],
                ]);

                $totals['gross'] += $calc['gross'];
                $totals['net'] += $calc['netPay'];
                $totals['pf'] += $calc['pfEmployee'] + $calc['pfEmployer'];
                $totals['esi'] += $calc['esiEmployee'] + $calc['esiEmployer'];
                $totals['tds'] += $calc['tds'];
            }

            $run->update([
                'gross_total' => $totals['gross'],
                'net_total' => $totals['net'],
                'pf_total' => $totals['pf'],
                'esi_total' => $totals['esi'],
                'tds_total' => $totals['tds'],
            ]);

            return $run;
        });

        return response()->json($run->fresh(), 201);
    }

    /**
     * GET /api/payroll/runs/{run} — payslip register, net pay masked per RBAC.
     */
    public function show(Request $request, string $run): JsonResponse
    {
        $user = $request->user();
        $tenantId = $user->tenant_id;

        $payrollRun = PayrollRun::where('tenant_id', $tenantId)->where('id', $run)->first();
        if (! $payrollRun) {
            return response()->json(['message' => 'Payroll run not found.'], 404);
        }

        $payslips = Payslip::where('payroll_run_id', $payrollRun->id)->get();

        $employeeIds = $payslips->pluck('employee_id')->unique()->values();
        $employees = Employee::where('tenant_id', $tenantId)
            ->whereIn('id', $employeeIds)
            ->get(['id', 'name', 'code'])
            ->keyBy('id');

        $maskNet = Rbac::fieldHidden($user, 'payslip.netPay');

        $totals = ['gross' => 0.0, 'basic' => 0.0, 'pf' => 0.0, 'esi' => 0.0, 'pt' => 0.0, 'tds' => 0.0, 'net' => 0.0];

        $slips = $payslips->map(function (Payslip $slip) use ($employees, $maskNet, &$totals) {
            $employee = $employees->get($slip->employee_id);

            $totals['gross'] += $slip->gross;
            $totals['basic'] += $slip->basic;
            $totals['pf'] += $slip->pf_employee + $slip->pf_employer;
            $totals['esi'] += $slip->esi_employee + $slip->esi_employer;
            $totals['pt'] += $slip->pt;
            $totals['tds'] += $slip->tds;
            $totals['net'] += $slip->net_pay;

            return [
                'id' => $slip->id,
                'employee' => $employee ? ['id' => $employee->id, 'name' => $employee->name, 'code' => $employee->code] : null,
                'gross' => $slip->gross,
                'basic' => $slip->basic,
                'pfEmployee' => $slip->pf_employee,
                'pfEmployer' => $slip->pf_employer,
                'esiEmployee' => $slip->esi_employee,
                'esiEmployer' => $slip->esi_employer,
                'pt' => $slip->pt,
                'tds' => $slip->tds,
                'lossOfPay' => $slip->loss_of_pay,
                'netPay' => $maskNet ? '•••' : $slip->net_pay,
            ];
        })->values();

        return response()->json([
            'run' => $payrollRun,
            'payslips' => $slips,
            'totals' => [
                'gross' => $totals['gross'],
                'basic' => $totals['basic'],
                'pf' => $totals['pf'],
                'esi' => $totals['esi'],
                'pt' => $totals['pt'],
                'tds' => $totals['tds'],
                'net' => $maskNet ? '•••' : $totals['net'],
            ],
        ]);
    }

    /**
     * POST /api/payroll/runs/{run}/lock — Draft -> Locked.
     */
    public function lock(Request $request, string $run): JsonResponse
    {
        return $this->transition($request, $run, from: 'Draft', to: 'Locked');
    }

    /**
     * POST /api/payroll/runs/{run}/pay — Locked -> Paid.
     */
    public function pay(Request $request, string $run): JsonResponse
    {
        return $this->transition($request, $run, from: 'Locked', to: 'Paid');
    }

    private function transition(Request $request, string $runId, string $from, string $to): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $payrollRun = PayrollRun::where('tenant_id', $tenantId)->where('id', $runId)->first();
        if (! $payrollRun) {
            return response()->json(['message' => 'Payroll run not found.'], 404);
        }

        if ($payrollRun->status !== $from) {
            return response()->json([
                'message' => "Cannot move a payroll run from '{$payrollRun->status}' to '{$to}' (expected '{$from}').",
            ], 409);
        }

        $payrollRun->update(['status' => $to]);

        return response()->json($payrollRun->fresh());
    }

    /**
     * Given the tenant's latest run (if any), figure out the next month/year to process.
     * Mirrors nextPeriod() in app/(app)/payroll/actions.ts.
     *
     * @param  array{month: int, year: int}|null  $last
     * @return array{0: int, 1: int} [month, year]
     */
    private function nextPeriod(?array $last): array
    {
        if (! $last) {
            $now = now();

            return [(int) $now->format('n'), (int) $now->format('Y')];
        }

        if ($last['month'] >= 12) {
            return [1, $last['year'] + 1];
        }

        return [$last['month'] + 1, $last['year']];
    }
}
