<?php

namespace App\Support;

/**
 * Minimal, dependency-free RFC 6238 TOTP (SHA1, 6 digits, 30s step).
 *
 * Used to enforce two-factor auth at login and to enrol/verify from the
 * Settings screen. Kept tiny and self-contained so the app has no external
 * 2FA dependency on the shared PHP host.
 */
class Totp
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    private const PERIOD = 30;

    private const DIGITS = 6;

    /** Generate a new base32 secret (default 20 random bytes → 32 chars). */
    public static function generateSecret(int $bytes = 20): string
    {
        return self::base32Encode(random_bytes($bytes));
    }

    /** otpauth:// URI an authenticator app (Google Authenticator, Authy…) can scan. */
    public static function otpauthUri(string $secret, string $label, string $issuer): string
    {
        $query = http_build_query([
            'secret' => $secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => self::DIGITS,
            'period' => self::PERIOD,
        ]);

        return sprintf('otpauth://totp/%s?%s', rawurlencode($issuer.':'.$label), $query);
    }

    /** Verify a user-supplied code against the secret, allowing ±$window steps for clock drift. */
    public static function verify(string $secret, string $code, int $window = 1): bool
    {
        $code = preg_replace('/\D/', '', $code);
        if ($secret === '' || strlen($code) !== self::DIGITS) {
            return false;
        }

        $counter = intdiv(time(), self::PERIOD);
        for ($i = -$window; $i <= $window; $i++) {
            if (hash_equals(self::codeAt($secret, $counter + $i), $code)) {
                return true;
            }
        }

        return false;
    }

    private static function codeAt(string $secret, int $counter): string
    {
        $key = self::base32Decode($secret);
        // 8-byte big-endian counter (high 32 bits are 0 well past year 2100).
        $binCounter = pack('N*', 0).pack('N*', $counter);
        $hash = hash_hmac('sha1', $binCounter, $key, true);
        $offset = ord($hash[strlen($hash) - 1]) & 0x0f;
        $value = (unpack('N', substr($hash, $offset, 4))[1]) & 0x7fffffff;

        return str_pad((string) ($value % (10 ** self::DIGITS)), self::DIGITS, '0', STR_PAD_LEFT);
    }

    private static function base32Encode(string $bytes): string
    {
        $buffer = 0;
        $bits = 0;
        $out = '';
        foreach (str_split($bytes) as $ch) {
            $buffer = ($buffer << 8) | ord($ch);
            $bits += 8;
            while ($bits >= 5) {
                $bits -= 5;
                $out .= self::ALPHABET[($buffer >> $bits) & 0x1f];
            }
        }
        if ($bits > 0) {
            $out .= self::ALPHABET[($buffer << (5 - $bits)) & 0x1f];
        }

        return $out;
    }

    private static function base32Decode(string $b32): string
    {
        $b32 = strtoupper(rtrim($b32, '='));
        $buffer = 0;
        $bits = 0;
        $out = '';
        foreach (str_split($b32) as $ch) {
            $val = strpos(self::ALPHABET, $ch);
            if ($val === false) {
                continue;
            }
            $buffer = ($buffer << 5) | $val;
            $bits += 5;
            if ($bits >= 8) {
                $bits -= 8;
                $out .= chr(($buffer >> $bits) & 0xff);
            }
        }

        return $out;
    }
}
