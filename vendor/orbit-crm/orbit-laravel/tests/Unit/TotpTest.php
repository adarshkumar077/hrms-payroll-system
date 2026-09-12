<?php

namespace Tests\Unit;

use App\Support\Totp;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class TotpTest extends TestCase
{
    public function test_generate_secret_is_base32(): void
    {
        $secret = Totp::generateSecret();
        // 20 bytes → 32 base32 chars, all from the RFC 4648 alphabet.
        $this->assertSame(32, strlen($secret));
        $this->assertMatchesRegularExpression('/^[A-Z2-7]+$/', $secret);
    }

    public function test_otpauth_uri_has_scheme_and_secret(): void
    {
        $uri = Totp::otpauthUri('JBSWY3DPEHPK3PXP', 'ceo@demo.orbit', 'Orbit');
        $this->assertStringStartsWith('otpauth://totp/', $uri);
        $this->assertStringContainsString('secret=JBSWY3DPEHPK3PXP', $uri);
        $this->assertStringContainsString('issuer=Orbit', $uri);
    }

    public function test_verify_accepts_current_code_and_rejects_bad_ones(): void
    {
        $secret = Totp::generateSecret();

        // Compute the code for the current step via the private helper.
        $codeAt = new ReflectionMethod(Totp::class, 'codeAt');
        $codeAt->setAccessible(true);
        $current = $codeAt->invoke(null, $secret, intdiv(time(), 30));

        $this->assertTrue(Totp::verify($secret, $current));
        $this->assertFalse(Totp::verify($secret, ''));
        $this->assertFalse(Totp::verify($secret, '123'));      // too short
        $this->assertFalse(Totp::verify($secret, '000000abc')); // non-digits stripped → '000000abc' invalid length
    }
}
