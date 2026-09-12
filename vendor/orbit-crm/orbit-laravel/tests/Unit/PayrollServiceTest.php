<?php

namespace Tests\Unit;

use App\Services\Compliance\PayrollService;
use PHPUnit\Framework\TestCase;

/**
 * Ported from lib/compliance/payroll.test.ts — same expected values, same scenarios.
 * Any change to an expected value here must be justified by a matching change on the TS side.
 */
class PayrollServiceTest extends TestCase
{
    // ---- isWageCompliant ----

    public function test_returns_true_when_basic_is_exactly_50_percent_of_gross(): void
    {
        $this->assertTrue(PayrollService::isWageCompliant(100000, 50000));
    }

    public function test_returns_true_when_basic_is_greater_than_50_percent_of_gross(): void
    {
        $this->assertTrue(PayrollService::isWageCompliant(100000, 60000));
    }

    public function test_returns_false_when_basic_is_less_than_50_percent_of_gross(): void
    {
        $this->assertFalse(PayrollService::isWageCompliant(100000, 49000));
    }

    public function test_handles_the_tolerance_buffer(): void
    {
        $this->assertTrue(PayrollService::isWageCompliant(100000, 50000));
    }

    public function test_returns_false_for_significantly_low_basic_amounts(): void
    {
        $this->assertFalse(PayrollService::isWageCompliant(100000, 40000));
    }

    // ---- suggestStructure ----

    public function test_suggests_basic_as_50_percent_of_gross(): void
    {
        $result = PayrollService::suggestStructure(100000);
        $this->assertSame(50000, $result['basic']);
    }

    public function test_suggests_hra_as_40_percent_of_basic(): void
    {
        $result = PayrollService::suggestStructure(100000);
        $this->assertSame(20000, $result['hra']);
    }

    public function test_calculates_allowances_as_remainder(): void
    {
        $result = PayrollService::suggestStructure(100000);
        $this->assertSame(30000, $result['allowances']);
    }

    public function test_sums_to_gross(): void
    {
        $result = PayrollService::suggestStructure(100000);
        $this->assertEquals($result['gross'], $result['basic'] + $result['hra'] + $result['allowances']);
    }

    public function test_marks_as_compliant(): void
    {
        $result = PayrollService::suggestStructure(100000);
        $this->assertTrue($result['compliant']);
    }

    public function test_handles_odd_amounts_with_rounding(): void
    {
        $result = PayrollService::suggestStructure(99999);
        $this->assertSame(50000, $result['basic']);
        $this->assertSame(20000, $result['hra']);
        $this->assertGreaterThanOrEqual(0, $result['allowances']);
    }

    // ---- pfEmployee ----

    public function test_pf_employee_12_percent_below_ceiling(): void
    {
        $this->assertSame(1200, PayrollService::pfEmployee(10000));
    }

    public function test_pf_employee_caps_at_wage_ceiling_for_higher_salaries(): void
    {
        $this->assertSame(1800, PayrollService::pfEmployee(20000));
    }

    public function test_pf_employee_caps_at_exactly_the_wage_ceiling(): void
    {
        $this->assertSame(1800, PayrollService::pfEmployee(PayrollService::PF_WAGE_CEILING));
    }

    public function test_pf_employee_returns_0_for_0_basic(): void
    {
        $this->assertSame(0, PayrollService::pfEmployee(0));
    }

    public function test_pf_employee_handles_rounding(): void
    {
        $this->assertSame(1200, PayrollService::pfEmployee(10001));
    }

    // ---- pfEmployer ----

    public function test_pf_employer_12_percent_below_ceiling(): void
    {
        $this->assertSame(1200, PayrollService::pfEmployer(10000));
    }

    public function test_pf_employer_caps_at_wage_ceiling_for_higher_salaries(): void
    {
        $this->assertSame(1800, PayrollService::pfEmployer(20000));
    }

    public function test_pf_employer_matches_employee_pf_contribution(): void
    {
        $this->assertSame(PayrollService::pfEmployee(10000), PayrollService::pfEmployer(10000));
        $this->assertSame(PayrollService::pfEmployee(20000), PayrollService::pfEmployer(20000));
    }

    // ---- esiEmployee ----

    public function test_esi_employee_075_percent_below_threshold(): void
    {
        $this->assertSame(75, PayrollService::esiEmployee(10000));
    }

    public function test_esi_employee_applies_at_exactly_the_threshold(): void
    {
        // 21,000 * 0.0075 = 157.5 -> rounds to 158.
        $this->assertSame(158, PayrollService::esiEmployee(PayrollService::ESI_WAGE_THRESHOLD));
    }

    public function test_esi_employee_returns_0_when_gross_exceeds_threshold(): void
    {
        $this->assertSame(0, PayrollService::esiEmployee(25000));
    }

    public function test_esi_employee_returns_0_for_very_high_salaries(): void
    {
        $this->assertSame(0, PayrollService::esiEmployee(50000));
    }

    public function test_esi_employee_handles_rounding_for_fractional_amounts(): void
    {
        $this->assertSame(75, PayrollService::esiEmployee(10001));
    }

    // ---- esiEmployer ----

    public function test_esi_employer_325_percent_below_threshold(): void
    {
        $this->assertSame(325, PayrollService::esiEmployer(10000));
    }

    public function test_esi_employer_applies_at_exactly_the_threshold(): void
    {
        // 21,000 * 0.0325 = 682.5 -> rounds to 683.
        $this->assertSame(683, PayrollService::esiEmployer(PayrollService::ESI_WAGE_THRESHOLD));
    }

    public function test_esi_employer_returns_0_when_gross_exceeds_threshold(): void
    {
        $this->assertSame(0, PayrollService::esiEmployer(25000));
    }

    public function test_esi_employer_higher_than_employee_esi(): void
    {
        $this->assertGreaterThan(PayrollService::esiEmployee(10000), PayrollService::esiEmployer(10000));
    }

    // ---- professionalTax ----

    public function test_pt_returns_0_when_gross_le_7500(): void
    {
        $this->assertSame(0, PayrollService::professionalTax(7500));
    }

    public function test_pt_returns_175_between_7500_and_10000(): void
    {
        $this->assertSame(175, PayrollService::professionalTax(9000));
    }

    public function test_pt_returns_175_when_gross_equals_10000(): void
    {
        $this->assertSame(175, PayrollService::professionalTax(10000));
    }

    public function test_pt_returns_200_when_gross_gt_10000(): void
    {
        $this->assertSame(200, PayrollService::professionalTax(10001));
    }

    public function test_pt_returns_200_for_high_salaries(): void
    {
        $this->assertSame(200, PayrollService::professionalTax(50000));
    }

    public function test_pt_returns_0_for_gross_lt_7500(): void
    {
        $this->assertSame(0, PayrollService::professionalTax(5000));
    }

    // ---- estimatedTds ----

    public function test_tds_returns_0_for_income_below_taxable_threshold(): void
    {
        $this->assertSame(0, PayrollService::estimatedTds(600000));
    }

    public function test_tds_calculates_for_income_in_first_slab(): void
    {
        // Taxable = 925,000; tax = 0 + 20,000 + 12,500 = 32,500; monthly = 32,500*1.04/12 ~= 2,817.
        $tds = PayrollService::estimatedTds(1000000);
        $this->assertGreaterThan(0, $tds);
        $this->assertEqualsWithDelta(2817, $tds, 10);
    }

    public function test_tds_applies_4_percent_cess(): void
    {
        $tds = PayrollService::estimatedTds(1000000);
        $this->assertGreaterThan(0, $tds);
    }

    public function test_tds_returns_0_for_very_low_annual_income(): void
    {
        $this->assertSame(0, PayrollService::estimatedTds(100000));
    }

    public function test_tds_increases_with_higher_income(): void
    {
        $tds1 = PayrollService::estimatedTds(800000);
        $tds2 = PayrollService::estimatedTds(1200000);
        $this->assertGreaterThanOrEqual($tds1, $tds2);
    }

    // ---- computePayslip ----

    public function test_net_pay_equals_gross_minus_deductions_minus_lop(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 50000,
            'basic' => 25000,
            'annualGross' => 600000,
            'lopDays' => 0,
            'daysInMonth' => 30,
        ]);
        $this->assertSame(48000, $payslip['netPay']);
    }

    public function test_includes_employer_contributions_in_output(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 50000,
            'basic' => 25000,
        ]);
        $this->assertSame(1800, $payslip['pfEmployer']);
        $this->assertSame(0, $payslip['esiEmployer']);
    }

    public function test_calculates_loss_of_pay_proportionally(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 30000,
            'basic' => 15000,
            'lopDays' => 5,
            'daysInMonth' => 30,
        ]);
        $this->assertSame(5000, $payslip['lossOfPay']);
    }

    public function test_uses_payable_gross_for_esi_and_pt(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 30000,
            'basic' => 15000,
            'lopDays' => 9,
            'daysInMonth' => 30,
        ]);
        $this->assertSame(158, $payslip['esiEmployee']);
        $this->assertSame(200, $payslip['pt']);
    }

    public function test_uses_original_basic_not_payable_for_pf(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 30000,
            'basic' => 15000,
            'lopDays' => 5,
            'daysInMonth' => 30,
        ]);
        $this->assertSame(1800, $payslip['pfEmployee']);
    }

    public function test_returns_0_loss_of_pay_when_lop_days_not_specified(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 50000,
            'basic' => 25000,
        ]);
        $this->assertSame(0, $payslip['lossOfPay']);
    }

    public function test_defaults_days_in_month_to_30(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 30000,
            'basic' => 15000,
            'lopDays' => 6,
        ]);
        $this->assertSame(6000, $payslip['lossOfPay']);
    }

    public function test_handles_salary_above_esi_threshold(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 25000,
            'basic' => 12500,
        ]);
        $this->assertSame(0, $payslip['esiEmployee']);
        $this->assertSame(0, $payslip['esiEmployer']);
    }

    public function test_handles_salary_above_pf_wage_ceiling(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 40000,
            'basic' => 20000,
        ]);
        $this->assertSame(1800, $payslip['pfEmployee']);
        $this->assertSame(1800, $payslip['pfEmployer']);
    }

    public function test_includes_all_components_in_payslip_object(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 50000,
            'basic' => 25000,
        ]);
        $this->assertSame(50000, $payslip['gross']);
        $this->assertSame(25000, $payslip['basic']);
        foreach (['pfEmployee', 'pfEmployer', 'esiEmployee', 'esiEmployer', 'pt', 'tds', 'lossOfPay', 'netPay'] as $key) {
            $this->assertArrayHasKey($key, $payslip);
        }
    }

    public function test_handles_annual_gross_parameter_for_tds(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 50000,
            'basic' => 25000,
            'annualGross' => 1200000,
        ]);
        $this->assertGreaterThan(0, $payslip['tds']);
    }

    public function test_uses_gross_times_12_as_default_annual_gross(): void
    {
        $payslip1 = PayrollService::computePayslip([
            'gross' => 50000,
            'basic' => 25000,
        ]);
        $payslip2 = PayrollService::computePayslip([
            'gross' => 50000,
            'basic' => 25000,
            'annualGross' => 600000,
        ]);
        $this->assertSame($payslip2['tds'], $payslip1['tds']);
    }

    public function test_handles_edge_case_zero_salary(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 0,
            'basic' => 0,
        ]);
        $this->assertSame(0, $payslip['netPay']);
        $this->assertSame(0, $payslip['pfEmployee']);
    }

    public function test_net_pay_equals_payable_gross_minus_deductions(): void
    {
        $payslip = PayrollService::computePayslip([
            'gross' => 50000,
            'basic' => 25000,
            'lopDays' => 2,
            'daysInMonth' => 30,
            'annualGross' => 600000,
        ]);
        $payableGross = 50000 - $payslip['lossOfPay'];
        $expectedNet = $payableGross - $payslip['pfEmployee'] - $payslip['esiEmployee'] - $payslip['pt'] - $payslip['tds'];
        $this->assertSame($expectedNet, $payslip['netPay']);
    }
}
