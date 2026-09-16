<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * GET /pinecall/log?list=1 and GET /pinecall/log?call=<id> — the widget's second endpoint, for
 * a Laravel site. Optional: with it the widget draws every conversation in the order it happened,
 * shows the telephone call as it comes in, and can show the tools the agent runs. Needs a key with the
 * `calls` scope; the same PINECALL_* variables as the token controller.
 *
 *   routes/web.php
 *     Route::get('/pinecall/log', [\App\Http\Controllers\PinecallLogController::class, 'read']);
 *
 *   the page
 *     <pinecall-widget agent="…" token-url="/pinecall/token" log-url="/pinecall/log" phone="…"></pinecall-widget>
 */
class PinecallLogController extends Controller
{
    private const TYPES = 'call.started,user.transcript,agent.transcript,turn.user,turn.agent,tool.call,tool.result,call.ended';

    public function read(Request $request): JsonResponse|StreamedResponse
    {
        $agent = (string) $request->query('agent', '');
        $served = array_filter(array_map('trim', explode(',', (string) env('PINECALL_AGENTS', ''))));
        if ($agent === '' || ($served && !in_array($agent, $served, true))) {
            return response()->json(['detail' => '?agent=<slug> names an agent this site serves'], 400);
        }
        if ($request->has('list')) {
            return $this->list($agent);
        }
        $call = (string) $request->query('call', '');
        if (!preg_match('/^call[-_][A-Za-z0-9+_-]{6,80}$/', $call)) {
            return response()->json(['detail' => '?list=1, or ?call=<id> as the list gives it'], 400);
        }
        return $this->stream($call);
    }

    /** The agent's latest telephone calls, the caller cut to three digits: the page is public. */
    private function list(string $agent): JsonResponse
    {
        $answer = Http::withToken(env('PINECALL_API_KEY'))->acceptJson()->timeout(15)
            ->get($this->base() . '/v1/agents/' . rawurlencode($agent) . '/sessions', ['limit' => 30]);
        if (!$answer->ok()) {
            return response()->json($answer->json(), $answer->status());
        }
        $calls = [];
        foreach ($answer->json('calls', []) as $session) {
            if (($session['channel'] ?? '') !== 'phone') {
                continue;
            }
            $from = preg_replace('/\D/', '', (string) ($session['from'] ?? ''));
            $calls[] = [
                'call' => $session['call'],
                'live' => (bool) ($session['live'] ?? false),
                'from' => $from === '' ? 'unknown' : '···' . substr($from, -3),
                'started_at' => $session['started_at'] ?? null,
            ];
        }
        return response()->json(['calls' => $calls]);
    }

    /** One call's log as the gateway streams it, relayed byte for byte, with its own status. */
    private function stream(string $call): StreamedResponse
    {
        $url = $this->base() . '/v1/calls/' . rawurlencode($call) . '/events?types=' . self::TYPES . '&after=0';
        return response()->stream(function () use ($url) {
            $curl = curl_init($url);
            curl_setopt_array($curl, [
                CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . env('PINECALL_API_KEY'), 'Accept: text/event-stream'],
                CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk): int {
                    echo $chunk;
                    if (ob_get_level() > 0) {
                        ob_flush();
                    }
                    flush();
                    return connection_aborted() ? 0 : strlen($chunk);
                },
                CURLOPT_TIMEOUT => 0,
                CURLOPT_CONNECTTIMEOUT => 15,
            ]);
            curl_exec($curl);
        }, 200, ['Content-Type' => 'text/event-stream', 'Cache-Control' => 'no-cache', 'X-Accel-Buffering' => 'no']);
    }

    private function base(): string
    {
        return rtrim(env('PINECALL_URL', 'https://box.pinecall.io'), '/');
    }
}
