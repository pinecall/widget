<?php
// GET /log.php?list=1          the agent's latest telephone calls, for the widget's "Call us" view
// GET /log.php?call=<id>       one call's log, live, as server-sent events (the widget reads it)
//
// The second endpoint the widget can use. It reads call logs with your API key — the key needs
// the `calls` scope for this — so the widget can draw a conversation in the order it happened,
// show the telephone call as it comes in, and show the tools Ava runs when the toggle is on.
// Optional: without it, the widget still talks and chats; it just draws from LiveKit alone.
declare(strict_types=1);

$PINECALL_URL = getenv('PINECALL_URL') ?: 'https://box.pinecall.io';
$PINECALL_API_KEY = getenv('PINECALL_API_KEY') ?: 'pk_live_PASTE_YOUR_KEY_HERE';
// Which agents this endpoint reads: a comma-separated list, or empty for every agent of the org.
$PINECALL_AGENTS = array_filter(array_map('trim', explode(',', (string) getenv('PINECALL_AGENTS'))));
$AGENT = (string) ($_GET['agent'] ?? '');
if ($AGENT === '' || ($PINECALL_AGENTS && !in_array($AGENT, $PINECALL_AGENTS, true))) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['detail' => 'log.php: ?agent=<slug> names an agent this site serves']);
    exit;
}

if (str_contains($PINECALL_API_KEY, 'PASTE_YOUR_KEY')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['detail' => 'log.php: put your Pinecall API key in $PINECALL_API_KEY']);
    exit;
}
$base = rtrim($PINECALL_URL, '/');
$auth = 'Authorization: Bearer ' . $PINECALL_API_KEY;

// ── the list ──────────────────────────────────────────────────────────────────
if (isset($_GET['list'])) {
    header('Content-Type: application/json');
    $curl = curl_init($base . '/v1/agents/' . rawurlencode($AGENT) . '/sessions?limit=30');
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => [$auth, 'Accept: application/json']]);
    $body = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    if ($body === false || $status !== 200) {
        http_response_code($body === false ? 502 : $status);
        echo $body === false ? json_encode(['detail' => curl_error($curl)]) : $body;
        exit;
    }
    $calls = [];
    foreach ((json_decode($body, true) ?: [])['calls'] ?? [] as $session) {
        if (($session['channel'] ?? '') !== 'phone') {
            continue;
        }
        $from = preg_replace('/\D/', '', (string) ($session['from'] ?? ''));
        // The page is public and a caller's number is theirs: the last three digits and no more.
        $calls[] = [
            'call' => $session['call'],
            'live' => (bool) ($session['live'] ?? false),
            'from' => $from === '' ? 'unknown' : '···' . substr($from, -3),
            'started_at' => $session['started_at'] ?? null,
        ];
    }
    echo json_encode(['calls' => $calls]);
    exit;
}

// ── one call, streamed ────────────────────────────────────────────────────────
$call = (string) ($_GET['call'] ?? '');
if (!preg_match('/^call[-_][A-Za-z0-9+_-]{6,80}$/', $call)) {
    http_response_code(400);
    header('Content-Type: application/json');
    echo json_encode(['detail' => 'log.php: ?list=1, or ?call=<id> as the list gives it']);
    exit;
}
while (ob_get_level() > 0) {
    ob_end_flush();
}
ignore_user_abort(false);
set_time_limit(0);
$types = 'call.started,user.transcript,agent.transcript,turn.user,turn.agent,tool.call,tool.result,call.ended';
$status = 0;
$started = false;
$curl = curl_init($base . '/v1/calls/' . rawurlencode($call) . '/events?types=' . $types . '&after=0');
curl_setopt_array($curl, [
    CURLOPT_HTTPHEADER => [$auth, 'Accept: text/event-stream'],
    CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$status): int {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $found)) {
            $status = (int) $found[1];
        }
        return strlen($line);
    },
    CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$status, &$started): int {
        if (!$started) {
            $started = true;
            http_response_code($status === 0 ? 502 : $status);
            header('Cache-Control: no-cache');
            header('X-Accel-Buffering: no');
            header('Content-Type: ' . ($status === 200 ? 'text/event-stream' : 'application/json'));
        }
        echo $chunk;
        flush();
        return connection_aborted() ? 0 : strlen($chunk);
    },
    CURLOPT_TIMEOUT => 0,
    CURLOPT_CONNECTTIMEOUT => 15,
]);
curl_exec($curl);
if (!$started) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['detail' => 'Pinecall did not answer: ' . curl_error($curl)]);
}
