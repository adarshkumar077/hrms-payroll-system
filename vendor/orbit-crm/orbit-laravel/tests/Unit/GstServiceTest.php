<?php

namespace Tests\Unit;

use App\Services\Compliance\GstService;
use PHPUnit\Framework\TestCase;

/**
 * Ported from lib/compliance/gst.test.ts — same expected values, same scenarios.
 * Any change to an expected value here must be justified by a matching change on the TS side.
 */
class GstServiceTest extends TestCase
{
    // ---- requiresEInvoice ----

    public function test_true_for_b2b_above_threshold(): void
    {
        $this->assertTrue(GstService::requiresEInvoice(500000001, 'B2B'));
    }

    public function test_false_for_b2b_at_or_below_threshold(): void
    {
        $this->assertFalse(GstService::requiresEInvoice(GstService::EINVOICE_AATO_THRESHOLD, 'B2B'));
    }

    public function test_false_for_b2c_regardless_of_aato(): void
    {
        $this->assertFalse(GstService::requiresEInvoice(1000000000, 'B2C'));
    }

    public function test_false_for_export_regardless_of_aato(): void
    {
        $this->assertFalse(GstService::requiresEInvoice(1000000000, 'Export'));
    }

    public function test_false_for_other_invoice_types_even_if_aato_above_5cr(): void
    {
        $this->assertFalse(GstService::requiresEInvoice(500000100, 'B2G'));
    }

    public function test_false_for_b2b_with_0_aato(): void
    {
        $this->assertFalse(GstService::requiresEInvoice(0, 'B2B'));
    }

    public function test_requires_e_invoice_only_for_b2b_above_threshold(): void
    {
        $threshold = GstService::EINVOICE_AATO_THRESHOLD;
        $this->assertTrue(GstService::requiresEInvoice($threshold + 1, 'B2B'));
        $this->assertFalse(GstService::requiresEInvoice($threshold + 1, 'B2C'));
        $this->assertFalse(GstService::requiresEInvoice($threshold, 'B2B'));
    }

    // ---- hsnDigitsRequired ----

    public function test_6_digits_above_threshold(): void
    {
        $this->assertSame(6, GstService::hsnDigitsRequired(500000001));
    }

    public function test_4_digits_at_threshold(): void
    {
        $this->assertSame(4, GstService::hsnDigitsRequired(GstService::EINVOICE_AATO_THRESHOLD));
    }

    public function test_4_digits_well_below_threshold(): void
    {
        $this->assertSame(4, GstService::hsnDigitsRequired(10000000));
    }

    public function test_6_digits_for_very_high_aato(): void
    {
        $this->assertSame(6, GstService::hsnDigitsRequired(5000000000));
    }

    public function test_4_digits_for_0_aato(): void
    {
        $this->assertSame(4, GstService::hsnDigitsRequired(0));
    }

    // ---- computeGst: intra-state ----

    public function test_splits_tax_equally_between_cgst_and_sgst(): void
    {
        $lines = [['qty' => 1, 'unitPrice' => 1000, 'taxRate' => 18]];
        $result = GstService::computeGst($lines, true);
        $this->assertSame(90.0, $result['cgst']);
        $this->assertSame(90.0, $result['sgst']);
        $this->assertSame(0.0, $result['igst']);
    }

    public function test_intra_state_sums_to_total_tax_amount(): void
    {
        $lines = [
            ['qty' => 2, 'unitPrice' => 500, 'taxRate' => 18],
            ['qty' => 1, 'unitPrice' => 1000, 'taxRate' => 5],
        ];
        $result = GstService::computeGst($lines, true);
        $this->assertEqualsWithDelta(230.0, $result['cgst'] + $result['sgst'], 0.01);
    }

    public function test_returns_igst_as_0_for_intra_state(): void
    {
        $lines = [['qty' => 1, 'unitPrice' => 100, 'taxRate' => 18]];
        $result = GstService::computeGst($lines, true);
        $this->assertSame(0.0, $result['igst']);
    }

    public function test_grand_total_equals_subtotal_plus_tax(): void
    {
        $lines = [['qty' => 1, 'unitPrice' => 1000, 'taxRate' => 18]];
        $result = GstService::computeGst($lines, true);
        $this->assertSame(1180.0, $result['grandTotal']);
    }

    // ---- computeGst: inter-state ----

    public function test_inter_state_igst_only_cgst_sgst_zero(): void
    {
        $lines = [['qty' => 1, 'unitPrice' => 1000, 'taxRate' => 18]];
        $result = GstService::computeGst($lines, false);
        $this->assertSame(180.0, $result['igst']);
        $this->assertSame(0.0, $result['cgst']);
        $this->assertSame(0.0, $result['sgst']);
    }

    public function test_inter_state_sets_igst_equal_to_total_tax(): void
    {
        $lines = [
            ['qty' => 2, 'unitPrice' => 500, 'taxRate' => 18],
            ['qty' => 1, 'unitPrice' => 1000, 'taxRate' => 5],
        ];
        $result = GstService::computeGst($lines, false);
        $this->assertEqualsWithDelta(230.0, $result['igst'], 0.01);
    }

    public function test_inter_state_grand_total_equals_subtotal_plus_igst(): void
    {
        $lines = [['qty' => 1, 'unitPrice' => 1000, 'taxRate' => 18]];
        $result = GstService::computeGst($lines, false);
        $this->assertSame(1180.0, $result['grandTotal']);
    }

    // ---- computeGst: multi-line ----

    public function test_handles_multiple_lines_with_different_quantities(): void
    {
        $lines = [
            ['qty' => 5, 'unitPrice' => 200, 'taxRate' => 5],
            ['qty' => 3, 'unitPrice' => 500, 'taxRate' => 12],
            ['qty' => 2, 'unitPrice' => 1000, 'taxRate' => 18],
        ];
        $result = GstService::computeGst($lines, true);
        $this->assertSame(4500.0, $result['subtotal']);
        $this->assertEqualsWithDelta(590.0, $result['cgst'] + $result['sgst'], 0.01);
        $this->assertSame(5090.0, $result['grandTotal']);
    }

    public function test_handles_lines_with_0_percent_tax(): void
    {
        $lines = [
            ['qty' => 1, 'unitPrice' => 500, 'taxRate' => 0],
            ['qty' => 1, 'unitPrice' => 500, 'taxRate' => 18],
        ];
        $result = GstService::computeGst($lines, true);
        $this->assertSame(1000.0, $result['subtotal']);
        $this->assertEqualsWithDelta(90.0, $result['cgst'] + $result['sgst'], 0.01);
    }

    // ---- computeGst: rounding & precision ----

    public function test_rounds_to_2_decimal_places(): void
    {
        $lines = [['qty' => 1, 'unitPrice' => 333.33, 'taxRate' => 18]];
        $result = GstService::computeGst($lines, true);
        $this->assertSame(333.33, $result['subtotal']);
        $this->assertSame(30.0, $result['cgst']);
        $this->assertSame(30.0, $result['sgst']);
    }

    public function test_handles_fractional_amounts_correctly(): void
    {
        $lines = [['qty' => 3, 'unitPrice' => 100.5, 'taxRate' => 5]];
        $result = GstService::computeGst($lines, true);
        $this->assertSame(301.5, $result['subtotal']);
    }

    public function test_grand_total_equals_subtotal_plus_tax_with_rounding(): void
    {
        $lines = [['qty' => 7, 'unitPrice' => 123.45, 'taxRate' => 12]];
        $result = GstService::computeGst($lines, true);
        $this->assertEqualsWithDelta($result['subtotal'] + $result['cgst'] + $result['sgst'], $result['grandTotal'], 0.01);
    }

    // ---- computeGst: edge cases ----

    public function test_handles_empty_lines_array(): void
    {
        $result = GstService::computeGst([], true);
        $this->assertSame(0.0, $result['subtotal']);
        $this->assertSame(0.0, $result['cgst']);
        $this->assertSame(0.0, $result['sgst']);
        $this->assertSame(0.0, $result['grandTotal']);
    }

    public function test_handles_single_line_invoice(): void
    {
        $lines = [['qty' => 1, 'unitPrice' => 1000, 'taxRate' => 18]];
        $result = GstService::computeGst($lines, true);
        $this->assertSame(1000.0, $result['subtotal']);
        $this->assertEqualsWithDelta(180.0, $result['cgst'] + $result['sgst'], 0.01);
        $this->assertSame(1180.0, $result['grandTotal']);
    }

    public function test_handles_high_value_invoices(): void
    {
        $lines = [['qty' => 1000, 'unitPrice' => 10000, 'taxRate' => 18]];
        $result = GstService::computeGst($lines, true);
        $this->assertSame(10000000.0, $result['subtotal']);
        $this->assertEqualsWithDelta(1800000.0, $result['cgst'] + $result['sgst'], 0.01);
    }

    // ---- mockIrn ----

    public function test_generates_a_64_char_hex_string(): void
    {
        $irn = GstService::mockIrn('test-seed');
        $this->assertSame(64, strlen($irn));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/i', $irn);
    }

    public function test_is_deterministic_for_the_same_seed(): void
    {
        $irn1 = GstService::mockIrn('consistent-seed');
        $irn2 = GstService::mockIrn('consistent-seed');
        $this->assertSame($irn1, $irn2);
    }

    public function test_produces_different_irns_for_different_seeds(): void
    {
        $irn1 = GstService::mockIrn('seed-1');
        $irn2 = GstService::mockIrn('seed-2');
        $this->assertNotSame($irn1, $irn2);
    }

    public function test_handles_empty_string_seed(): void
    {
        $irn = GstService::mockIrn('');
        $this->assertSame(64, strlen($irn));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/i', $irn);
    }

    public function test_handles_long_seed_strings(): void
    {
        $longSeed = str_repeat('a', 1000);
        $irn = GstService::mockIrn($longSeed);
        $this->assertSame(64, strlen($irn));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/i', $irn);
    }

    public function test_handles_special_characters_in_seed(): void
    {
        $specialSeed = 'test@#$%^&*()_+-=[]{}';
        $irn = GstService::mockIrn($specialSeed);
        $this->assertSame(64, strlen($irn));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/i', $irn);
    }

    public function test_is_reproducible_across_multiple_calls(): void
    {
        $seeds = ['invoice-001', 'invoice-002', 'invoice-003'];
        $results = array_map(fn ($s) => GstService::mockIrn($s), $seeds);
        foreach ($results as $irn) {
            $this->assertSame(64, strlen($irn));
            $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/i', $irn);
        }
        $this->assertNotSame($results[0], $results[1]);
        $this->assertNotSame($results[1], $results[2]);
    }

    public function test_produces_valid_64_char_output_for_differing_seeds(): void
    {
        $irn1 = GstService::mockIrn('TestSeed');
        $irn2 = GstService::mockIrn('a-clearly-different-and-longer-seed');
        $this->assertSame(64, strlen($irn1));
        $this->assertSame(64, strlen($irn2));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/i', $irn1);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/i', $irn2);
    }

    public function test_uses_multiple_hex_characters_across_outputs(): void
    {
        $irns = [GstService::mockIrn('seed1'), GstService::mockIrn('seed2'), GstService::mockIrn('seed3')];
        $charactersUsed = [];
        foreach ($irns as $irn) {
            foreach (str_split($irn) as $char) {
                $charactersUsed[$char] = true;
            }
        }
        $this->assertGreaterThan(1, count($charactersUsed));
    }

    public function test_generates_irn_format_suitable_for_invoice_identification(): void
    {
        $invoiceData = 'INV-20250706-00123-CompanyName';
        $irn = GstService::mockIrn($invoiceData);
        $this->assertSame(64, strlen($irn));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/i', $irn);
        $this->assertSame($irn, GstService::mockIrn($invoiceData));
    }
}
