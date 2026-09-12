<?php

namespace App\Services\Compliance;

/**
 * India payroll statutory engine — verified rules (2025-2026).
 * PF 12%+12% (₹15k wage ceiling, 8.33% to EPS); ESI 0.75%/3.25% (≤₹21k); PT state slabs;
 * 2025 Labour Codes: basic must be >= 50% of gross.
 *
 * Ported 1:1 from lib/compliance/payroll.ts — keep in sync, do not "improve" the maths here.
 */
class PayrollService
{
    public const PF_WAGE_CEILING = 15000;
    public const ESI_WAGE_THRESHOLD = 21000;

    /**
     * JS Math.round() semantics (round half away from zero) — matches PHP round()
     * with the default mode for the non-negative wage figures used throughout payroll.
     */
    private static function round(float $n): int
    {
        return (int) round($n, 0, PHP_ROUND_HALF_UP);
    }

    public static function isWageCompliant(float $gross, float $basic): bool
    {
        return $basic >= $gross * 0.5 - 0.01;
    }

    /**
     * Suggest a compliant split: basic = 50% of gross, HRA = 40% of basic, rest allowances.
     *
     * @return array{gross: float, basic: int, hra: int, allowances: int, compliant: bool}
     */
    public static function suggestStructure(float $gross): array
    {
        $basic = self::round($gross * 0.5);
        $hra = self::round($basic * 0.4);
        $allowances = max(0, $gross - $basic - $hra);

        return [
            'gross' => $gross,
            'basic' => $basic,
            'hra' => $hra,
            'allowances' => (int) self::round($allowances),
            'compliant' => true,
        ];
    }

    public static function pfEmployee(float $basic): int
    {
        $base = min($basic, self::PF_WAGE_CEILING);

        return self::round($base * 0.12);
    }

    public static function pfEmployer(float $basic): int
    {
        $base = min($basic, self::PF_WAGE_CEILING);

        return self::round($base * 0.12);
    }

    public static function esiEmployee(float $gross): int
    {
        if ($gross > self::ESI_WAGE_THRESHOLD) {
            return 0;
        }

        return self::round($gross * 0.0075);
    }

    public static function esiEmployer(float $gross): int
    {
        if ($gross > self::ESI_WAGE_THRESHOLD) {
            return 0;
        }

        return self::round($gross * 0.0325);
    }

    /** Simplified Maharashtra-style PT slab (state-varying in reality). */
    public static function professionalTax(float $gross): int
    {
        if ($gross <= 7500) {
            return 0;
        }
        if ($gross <= 10000) {
            return 175;
        }

        return 200;
    }

    /** Very simplified monthly TDS (new regime, ₹7L rebate) — placeholder for a full engine. */
    public static function estimatedTds(float $annualGross): int
    {
        $taxable = max(0, $annualGross - 75000); // std deduction
        if ($taxable <= 700000) {
            return 0;
        }

        $tax = 0.0;
        $slabs = [
            [400000, 0],
            [800000, 0.05],
            [1200000, 0.1],
            [1600000, 0.15],
            [2000000, 0.2],
            [INF, 0.3],
        ];
        $prev = 0;
        foreach ($slabs as [$ceil, $rate]) {
            if ($taxable > $prev) {
                $tax += (min($taxable, $ceil) - $prev) * $rate;
                $prev = $ceil;
            }
        }

        return self::round(($tax * 1.04) / 12); // +4% cess, monthly
    }

    /**
     * @param  array{gross: float, basic: float, annualGross?: float, lopDays?: float, daysInMonth?: float}  $params
     * @return array{gross: float, basic: float, pfEmployee: int, pfEmployer: int, esiEmployee: int, esiEmployer: int, pt: int, tds: int, lossOfPay: int, netPay: int}
     */
    public static function computePayslip(array $params): array
    {
        $gross = $params['gross'];
        $basic = $params['basic'];
        $daysInMonth = $params['daysInMonth'] ?? 30;
        $lopDays = $params['lopDays'] ?? 0;
        $lossOfPay = self::round(($gross / $daysInMonth) * $lopDays);
        $payableGross = $gross - $lossOfPay;

        $pfE = self::pfEmployee($basic);
        $pfR = self::pfEmployer($basic);
        $esiE = self::esiEmployee($payableGross);
        $esiR = self::esiEmployer($payableGross);
        $pt = self::professionalTax($payableGross);
        $tds = self::estimatedTds($params['annualGross'] ?? $gross * 12);
        $netPay = self::round($payableGross - $pfE - $esiE - $pt - $tds);

        return [
            'gross' => $gross,
            'basic' => $basic,
            'pfEmployee' => $pfE,
            'pfEmployer' => $pfR,
            'esiEmployee' => $esiE,
            'esiEmployer' => $esiR,
            'pt' => $pt,
            'tds' => $tds,
            'lossOfPay' => $lossOfPay,
            'netPay' => $netPay,
        ];
    }
}
