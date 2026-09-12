<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Copilot;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CopilotController extends Controller
{
    /**
     * POST /api/copilot/ask — "Chat with your data". Body: { question }
     * Returns { answer, intent, source, data? } — see Copilot::ask().
     */
    public function ask(Request $request): JsonResponse
    {
        $data = $request->validate([
            'question' => ['required', 'string', 'max:1000'],
        ]);

        $result = Copilot::ask($request->user()->tenant_id, $data['question']);

        return response()->json($result);
    }
}
