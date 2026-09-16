<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * POST /pinecall/token — the one endpoint the Pinecall widget needs, for a Laravel site.
 *
 * The browser asks for a visit token; this asks Pinecall with the API key from .env and hands
 * back what the widget expects. The key never reaches the page.
 *
 *   .env
 *     PINECALL_URL=https://box.pinecall.io
 *     PINECALL_API_KEY=pk_live_...
 *     PINECALL_AGENTS=bidfire-dispatch,bidfire-sales   # empty: every agent of the org
 *
 *   routes/web.php
 *     Route::post('/pinecall/token', [\App\Http\Controllers\PinecallTokenController::class, 'mint'])
 *         ->withoutMiddleware([\App\Http\Middleware\VerifyCsrfToken::class]);
 *
 *   the page
 *     <pinecall-widget agent="bidfire-sales" token-url="/pinecall/token"></pinecall-widget>
 */
class PinecallTokenController extends Controller
{
    public function mint(Request $request): JsonResponse
    {
        $scope = $request->input('scope') === 'chat' ? 'chat' : 'talk';
        $agent = (string) $request->input('agent', '');
        $served = array_filter(array_map('trim', explode(',', (string) env('PINECALL_AGENTS', ''))));
        if ($agent === '' || ($served && !in_array($agent, $served, true))) {
            return response()->json(['detail' => 'the widget must name an agent this site serves'], 400);
        }

        $answer = Http::withToken(config('services.pinecall.key', env('PINECALL_API_KEY')))
            ->acceptJson()
            ->timeout(15)
            ->post(rtrim(env('PINECALL_URL', 'https://box.pinecall.io'), '/') . '/v1/tokens', [
                'agent' => $agent,
                'scope' => $scope,
                'ttl_s' => 60,
                'metadata' => ['page' => (string) $request->headers->get('referer', ''), 'scope' => $scope],
            ]);

        // Pinecall's answer, verbatim, with its own status: 201 with the token, or its refusal.
        return response()->json($answer->json(), $answer->status());
    }
}
