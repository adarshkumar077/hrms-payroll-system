<?php

namespace App\Services;

use GuzzleHttp\Client;
use RuntimeException;
use Throwable;

/**
 * Invoice/document OCR — pluggable, vision-model based. Ported 1:1 from lib/ocr.ts.
 *
 * Uses any OpenAI-compatible VISION model via LLM_BASE_URL/LLM_API_KEY + OCR_MODEL
 * (the plain text LLM_MODEL from AiService generally won't do vision — a separate
 * vision-capable model id is required).
 *
 * Degrades to a manual-entry stub when no vision model is configured, so the
 * upload-a-bill flow always works. Never throws.
 */
class OcrService
{
    private const PROMPT = 'Extract this vendor invoice/bill into STRICT JSON only (no prose): '
        .'{"vendor":"","gstin":"","billNumber":"","date":"","subtotal":0,"tax":0,"total":0,'
        .'"lines":[{"description":"","hsn":"","qty":0,"unitPrice":0,"taxRate":0,"lineTotal":0}]}. '
        .'Amounts as numbers (no currency symbols/commas). Use empty string / 0 where unknown. Indian GST invoice.';

    /** True only when both the LLM endpoint creds AND a vision-capable OCR_MODEL are set. */
    public static function ocrConfigured(): bool
    {
        return (bool) (env('LLM_BASE_URL') && env('LLM_API_KEY') && env('OCR_MODEL'));
    }

    public static function ocrModelLabel(): string
    {
        return env('OCR_MODEL') ?: 'manual';
    }

    /**
     * @param  string  $dataUrl  e.g. "data:image/png;base64,...."
     * @return array{vendor:string,gstin:?string,billNumber:string,date:?string,subtotal:float,tax:float,total:float,lines:array,mode:'vision'|'stub',note?:string}
     */
    public static function extractInvoice(string $dataUrl): array
    {
        if (! self::ocrConfigured()) {
            return self::stub();
        }

        try {
            $client = new Client(['timeout' => 30]);
            $base = rtrim((string) env('LLM_BASE_URL'), '/');

            $res = $client->post($base.'/chat/completions', [
                'headers' => [
                    'Content-Type' => 'application/json',
                    'Authorization' => 'Bearer '.env('LLM_API_KEY'),
                ],
                'json' => [
                    'model' => env('OCR_MODEL'),
                    'max_tokens' => 1200,
                    'temperature' => 0,
                    'messages' => [[
                        'role' => 'user',
                        'content' => [
                            ['type' => 'text', 'text' => self::PROMPT],
                            ['type' => 'image_url', 'image_url' => ['url' => $dataUrl]],
                        ],
                    ]],
                ],
            ]);

            $data = json_decode((string) $res->getBody(), true);
            $text = $data['choices'][0]['message']['content'] ?? '';

            if (! preg_match('/\{[\s\S]*\}/', $text, $m)) {
                throw new RuntimeException('no JSON in OCR response');
            }

            $p = json_decode($m[0], true);
            if (! is_array($p)) {
                throw new RuntimeException('invalid JSON in OCR response');
            }

            return [
                'vendor' => (string) ($p['vendor'] ?? ''),
                'gstin' => $p['gstin'] ?: null,
                'billNumber' => (string) ($p['billNumber'] ?? ''),
                'date' => $p['date'] ?: null,
                'subtotal' => self::num($p['subtotal'] ?? 0),
                'tax' => self::num($p['tax'] ?? 0),
                'total' => self::num($p['total'] ?? 0),
                'lines' => is_array($p['lines'] ?? null)
                    ? array_map(fn ($l) => [
                        'description' => (string) ($l['description'] ?? ''),
                        'hsn' => $l['hsn'] ?: null,
                        'qty' => self::num($l['qty'] ?? 0),
                        'unitPrice' => self::num($l['unitPrice'] ?? 0),
                        'taxRate' => self::num($l['taxRate'] ?? 0),
                        'lineTotal' => self::num($l['lineTotal'] ?? 0),
                    ], $p['lines'])
                    : [],
                'mode' => 'vision',
            ];
        } catch (Throwable $e) {
            return self::stub("OCR failed ({$e->getMessage()}) — enter details manually.");
        }
    }

    private static function stub(?string $note = null): array
    {
        return [
            'vendor' => '',
            'gstin' => null,
            'billNumber' => '',
            'date' => null,
            'subtotal' => 0,
            'tax' => 0,
            'total' => 0,
            'lines' => [],
            'mode' => 'stub',
            'note' => $note ?? 'OCR model not configured — fill the fields manually or set OCR_MODEL in .env.',
        ];
    }

    private static function num(mixed $v): float
    {
        $n = (float) preg_replace('/[^\d.\-]/', '', (string) $v);

        return is_finite($n) ? $n : 0.0;
    }
}
