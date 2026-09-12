<?php

namespace App\Services\Compliance;

/**
 * India GST engine — verified rules.
 * e-invoicing mandatory for AATO > ₹5cr (B2B/exports); HSN 6-digit (>5cr) / 4-digit (<=5cr);
 * intra-state => CGST+SGST, inter-state => IGST. IRN = 64-char reference from IRP.
 *
 * Ported 1:1 from lib/compliance/gst.ts — keep in sync, do not "improve" the maths here.
 */
class GstService
{
    /** ₹5 crore */
    public const EINVOICE_AATO_THRESHOLD = 50000000;

    public static function requiresEInvoice(float $aato, string $invoiceType): bool
    {
        return $aato > self::EINVOICE_AATO_THRESHOLD && $invoiceType === 'B2B';
    }

    public static function hsnDigitsRequired(float $aato): int
    {
        return $aato > self::EINVOICE_AATO_THRESHOLD ? 6 : 4;
    }

    /**
     * intraState => split CGST/SGST equally; interState => IGST.
     *
     * @param  array<int, array{qty: float, unitPrice: float, taxRate: float}>  $lines
     * @return array{subtotal: float, cgst: float, sgst: float, igst: float, grandTotal: float}
     */
    public static function computeGst(array $lines, bool $intraState): array
    {
        $subtotal = 0.0;
        $tax = 0.0;
        foreach ($lines as $l) {
            $lineBase = $l['qty'] * $l['unitPrice'];
            $subtotal += $lineBase;
            $tax += ($lineBase * $l['taxRate']) / 100;
        }
        $subtotal = self::round2($subtotal);
        $tax = self::round2($tax);
        $cgst = $intraState ? self::round2($tax / 2) : 0.0;
        $sgst = $intraState ? self::round2($tax / 2) : 0.0;
        $igst = $intraState ? 0.0 : $tax;

        return [
            'subtotal' => $subtotal,
            'cgst' => $cgst,
            'sgst' => $sgst,
            'igst' => $igst,
            'grandTotal' => self::round2($subtotal + $tax),
        ];
    }

    /**
     * Deterministic mock IRN generator (64 hex chars). Real impl calls the IRP/GSP API.
     *
     * Ported to preserve the exact JS quirks of gst.ts's mockIrn: an empty seed makes
     * `seed.charCodeAt(NaN)` return NaN in JS, which collapses `(h * 31 + NaN + i) >>> 0`
     * to 0 on every iteration — so an empty seed always yields 64 zero characters here too.
     */
    public static function mockIrn(string $seed): string
    {
        $len = strlen($seed);

        if ($len === 0) {
            return str_repeat('0', 64);
        }

        $h = 0;
        $out = [];
        for ($i = 0; $i < 64; $i++) {
            $charCode = ord($seed[($i + $len) % $len]);
            $h = ($h * 31 + $charCode + $i) & 0xFFFFFFFF;
            $out[] = dechex($h & 0xf);
        }

        return implode('', $out);
    }

    private static function round2(float $n): float
    {
        return round($n * 100, 0, PHP_ROUND_HALF_UP) / 100;
    }
}
