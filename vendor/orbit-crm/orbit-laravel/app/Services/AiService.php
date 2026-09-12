<?php

namespace App\Services;

use GuzzleHttp\Client;
use Throwable;

/**
 * Orbit AI layer — provider-agnostic, ported 1:1 from lib/ai.ts.
 *
 * Priority: (1) any OpenAI-compatible endpoint via LLM_BASE_URL/LLM_API_KEY/LLM_MODEL
 * (works with Groq, OpenRouter, Together, local Ollama, etc.), (2) a deterministic
 * local heuristic fallback.
 *
 * Design law (mirrors ai.ts): every public method degrades gracefully — wrapped in
 * try/catch — so the app is ALWAYS demoable even with no LLM configured. Never throws.
 *
 * Env is read directly via env() (not config()) so this class works identically from
 * plain PHPUnit tests (no framework bootstrap) and from the full app at runtime.
 */
class AiService
{
    /** True only when an OpenAI-compatible LLM endpoint is fully configured. */
    public static function aiEnabled(): bool
    {
        return (bool) (env('LLM_BASE_URL') && env('LLM_API_KEY'));
    }

    /** Human-readable provider label for UI badges (e.g. "groq.com · llama-3.3-70b-versatile" or "Local"). */
    public static function providerLabel(): string
    {
        if (! self::aiEnabled()) {
            return 'Local';
        }

        $host = parse_url((string) env('LLM_BASE_URL'), PHP_URL_HOST) ?: 'LLM';

        return $host.' · '.self::model();
    }

    /**
     * AI-5: Lead scoring.
     *
     * @param  array{name?: string, company?: ?string, source?: string, email?: ?string, phone?: ?string}  $lead
     * @return array{score: int, reason: string, source: 'model'|'fallback'}
     */
    public static function scoreLead(array $lead): array
    {
        if (self::aiEnabled()) {
            try {
                $txt = self::complete(
                    'You are a B2B sales lead scorer for an Indian SMB. Respond with ONLY compact JSON: {"score":<0-100 integer>,"reason":"<max 12 words>"}. No prose, no markdown.',
                    'Lead: '.json_encode($lead).'. Score conversion likelihood.',
                    150
                );
                if (preg_match('/\{[\s\S]*\}/', $txt, $m)) {
                    $p = json_decode($m[0], true);
                    if (is_array($p)) {
                        return [
                            'score' => self::clamp($p['score'] ?? 0),
                            'reason' => substr((string) ($p['reason'] ?? 'AI scored'), 0, 80),
                            'source' => 'model',
                        ];
                    }
                }
            } catch (Throwable $e) {
                // fall through to heuristic
            }
        }

        $h = self::heuristicScore($lead);

        return ['score' => $h['score'], 'reason' => $h['reason'], 'source' => 'fallback'];
    }

    /**
     * @param  array{company?: ?string, source?: string, email?: ?string, phone?: ?string}  $lead
     * @return array{score: int, reason: string}
     */
    private static function heuristicScore(array $lead): array
    {
        $score = 40;
        $reasons = [];

        if (in_array($lead['source'] ?? null, ['IndiaMART', 'JustDial', 'TradeIndia'], true)) {
            $score += 20;
            $reasons[] = 'high-intent marketplace source';
        }
        if (! empty($lead['company'])) {
            $score += 15;
            $reasons[] = 'named company';
        }
        if (! empty($lead['email'])) {
            $score += 10;
        }
        if (! empty($lead['phone'])) {
            $score += 10;
        }

        return [
            'score' => self::clamp($score),
            'reason' => $reasons ? implode(', ', $reasons) : 'baseline profile',
        ];
    }

    /**
     * AI-2: Follow-up drafting.
     *
     * @param  array{leadName: string, company?: ?string, channel: 'email'|'whatsapp', context?: ?string}  $ctx
     */
    public static function draftFollowUp(array $ctx): string
    {
        $leadName = $ctx['leadName'] ?? '';
        $channel = $ctx['channel'] ?? 'email';
        $company = $ctx['company'] ?? null;

        if (self::aiEnabled()) {
            try {
                $out = self::complete(
                    'You draft short, warm B2B sales follow-ups for an Indian SMB. Professional, concise, India business English. Return only the message.',
                    sprintf(
                        'Draft a %s follow-up to %s%s. %s',
                        $channel,
                        $leadName,
                        $company ? ' at '.$company : '',
                        $ctx['context'] ?? ''
                    ),
                    350
                );
                if (trim($out) !== '') {
                    return trim($out);
                }
            } catch (Throwable $e) {
                // fall through
            }
        }

        $hi = $channel === 'whatsapp' ? 'Hi' : 'Dear';
        $companySuffix = $company ? ' on behalf of '.$company : '';

        return "{$hi} {$leadName},\n\nThank you for your interest{$companySuffix}. I'd love to show you how Orbit can streamline your operations. Would a quick 15-minute call this week work?\n\nWarm regards,\nSales Team";
    }

    /** AI-3: Call summarization. */
    public static function summarizeCall(string $transcript): string
    {
        if (self::aiEnabled()) {
            try {
                $out = self::complete(
                    "Summarize this sales call in exactly 2 bullet points followed by one 'Next step:' line. Be crisp. Return only the summary.",
                    $transcript,
                    250
                );
                if (trim($out) !== '') {
                    return trim($out);
                }
            } catch (Throwable $e) {
                // fall through
            }
        }

        $words = count(array_filter(preg_split('/\s+/', trim($transcript)) ?: []));

        return "\u{2022} Call logged ({$words} words).\n\u{2022} Key points captured.\nNext step: schedule follow-up.";
    }

    private static function model(): string
    {
        return env('LLM_MODEL', 'llama-3.3-70b-versatile');
    }

    /** Unified completion call to the configured OpenAI-compatible endpoint. Throws on failure — callers catch. */
    private static function complete(string $system, string $user, int $maxTokens = 400): string
    {
        $client = new Client(['timeout' => 20]);
        $base = rtrim((string) env('LLM_BASE_URL'), '/');

        $res = $client->post($base.'/chat/completions', [
            'headers' => [
                'Content-Type' => 'application/json',
                'Authorization' => 'Bearer '.env('LLM_API_KEY'),
            ],
            'json' => [
                'model' => self::model(),
                'messages' => [
                    ['role' => 'system', 'content' => $system],
                    ['role' => 'user', 'content' => $user],
                ],
                'max_tokens' => $maxTokens,
                'temperature' => 0.4,
            ],
        ]);

        $data = json_decode((string) $res->getBody(), true);

        return $data['choices'][0]['message']['content'] ?? '';
    }

    private static function clamp(mixed $n): int
    {
        return max(0, min(100, (int) round((float) $n)));
    }
}
