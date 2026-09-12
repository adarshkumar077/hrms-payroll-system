<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Services\AiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AiController extends Controller
{
    /**
     * GET /api/ai/status — is a live LLM configured, and which provider/model.
     */
    public function status(): JsonResponse
    {
        return response()->json([
            'enabled' => AiService::aiEnabled(),
            'provider' => AiService::providerLabel(),
        ]);
    }

    /**
     * POST /api/ai/score-all — AI-5: score every lead for the authenticated tenant,
     * persist score + score_reason, return a summary of what happened.
     */
    public function scoreAll(Request $request): JsonResponse
    {
        $tenantId = $request->user()->tenant_id;

        $leads = Lead::forTenant($tenantId)->get();

        $scored = 0;
        foreach ($leads as $lead) {
            $result = AiService::scoreLead([
                'name' => $lead->name,
                'company' => $lead->company,
                'source' => $lead->source,
                'email' => $lead->email,
                'phone' => $lead->phone,
            ]);

            $lead->update([
                'score' => $result['score'],
                'score_reason' => $result['reason'],
            ]);
            $scored++;
        }

        return response()->json([
            'total' => $leads->count(),
            'scored' => $scored,
        ]);
    }

    /**
     * POST /api/ai/draft — AI-2: draft a follow-up message.
     * Body: { leadName, company?, channel?, context? }
     */
    public function draft(Request $request): JsonResponse
    {
        $data = $request->validate([
            'leadName' => ['required', 'string', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'channel' => ['nullable', 'string', 'in:email,whatsapp'],
            'context' => ['nullable', 'string', 'max:2000'],
        ]);

        $draft = AiService::draftFollowUp([
            'leadName' => $data['leadName'],
            'company' => $data['company'] ?? null,
            'channel' => $data['channel'] ?? 'email',
            'context' => $data['context'] ?? null,
        ]);

        return response()->json(['draft' => $draft]);
    }

    /**
     * POST /api/ai/summarize — AI-3: summarize a call transcript.
     * Body: { transcript }
     */
    public function summarize(Request $request): JsonResponse
    {
        $data = $request->validate([
            'transcript' => ['required', 'string', 'max:20000'],
        ]);

        $summary = AiService::summarizeCall($data['transcript']);

        return response()->json(['summary' => $summary]);
    }
}
