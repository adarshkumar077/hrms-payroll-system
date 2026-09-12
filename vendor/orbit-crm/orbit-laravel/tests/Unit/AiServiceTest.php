<?php

namespace Tests\Unit;

use App\Services\AiService;
use App\Services\Copilot;
use PHPUnit\Framework\TestCase;

/**
 * Ported from the fallback-path guarantees of lib/ai.ts and lib/copilot.ts: with no
 * LLM configured, AiService/Copilot must degrade to their deterministic local
 * heuristics rather than throw or hang on a network call.
 *
 * Uses plain PHPUnit\Framework\TestCase (no framework bootstrap, no DB) — mirrors
 * GstServiceTest/PayrollServiceTest — so this suite never touches the network.
 */
class AiServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Force the fallback path regardless of what's in the host environment.
        putenv('LLM_BASE_URL');
        putenv('LLM_API_KEY');
        putenv('OCR_MODEL');
        unset($_ENV['LLM_BASE_URL'], $_ENV['LLM_API_KEY'], $_ENV['OCR_MODEL']);
        unset($_SERVER['LLM_BASE_URL'], $_SERVER['LLM_API_KEY'], $_SERVER['OCR_MODEL']);
    }

    public function test_ai_not_enabled_without_llm_env(): void
    {
        $this->assertFalse(AiService::aiEnabled());
    }

    public function test_score_lead_falls_back_to_heuristic_without_llm_env(): void
    {
        $result = AiService::scoreLead([
            'name' => 'Acme Buyer',
            'company' => 'Acme Pvt Ltd',
            'source' => 'IndiaMART',
            'email' => 'buyer@acme.test',
            'phone' => '9999999999',
        ]);

        $this->assertSame('fallback', $result['source']);
        $this->assertIsInt($result['score']);
        $this->assertGreaterThanOrEqual(0, $result['score']);
        $this->assertLessThanOrEqual(100, $result['score']);
        // High-intent source + named company + email + phone => well above the 40 baseline.
        $this->assertGreaterThan(40, $result['score']);
        $this->assertNotEmpty($result['reason']);
    }

    public function test_score_lead_baseline_for_sparse_lead(): void
    {
        $result = AiService::scoreLead(['name' => 'Anon', 'source' => 'Website']);

        $this->assertSame('fallback', $result['source']);
        $this->assertSame(40, $result['score']);
        $this->assertSame('baseline profile', $result['reason']);
    }

    public function test_draft_follow_up_falls_back_to_template(): void
    {
        $out = AiService::draftFollowUp([
            'leadName' => 'Priya',
            'company' => 'Test Co',
            'channel' => 'whatsapp',
        ]);

        $this->assertStringContainsString('Priya', $out);
        $this->assertStringStartsWith('Hi Priya', $out);
    }

    public function test_summarize_call_falls_back_to_word_count_stub(): void
    {
        $out = AiService::summarizeCall('customer asked about pricing and delivery timelines');

        $this->assertStringContainsString('Call logged', $out);
        $this->assertStringContainsString('Next step:', $out);
    }

    public function test_copilot_keyword_fallback_resolves_known_intents(): void
    {
        $this->assertSame('receivables_outstanding', Copilot::keywordIntent('What is outstanding from customers?'));
        $this->assertSame('cash_position', Copilot::keywordIntent('What is our cash position right now?'));
        $this->assertSame('revenue_won', Copilot::keywordIntent('How much revenue have we won this quarter?'));
        $this->assertSame('low_stock_items', Copilot::keywordIntent('Which items are running low on stock?'));
        $this->assertSame('headcount', Copilot::keywordIntent('What is our current headcount?'));
        $this->assertSame('open_tickets', Copilot::keywordIntent('How many support tickets are open?'));
    }

    public function test_copilot_keyword_fallback_returns_unknown_for_unmatched_question(): void
    {
        $this->assertSame('unknown', Copilot::keywordIntent('asdkjh random words xyz'));
    }
}
