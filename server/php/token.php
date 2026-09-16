<?php
// POST /token.php — the one server-side piece the widget needs. Plain PHP, no framework.
//
// The browser asks this file for a visit token; this file asks Pinecall with your API key and
// hands back what the widget expects. The key stays here. Put this file anywhere your site
// serves PHP and point the widget's `token-url` at it.
//
// Two settings. Fill them in, or set the same names as environment variables.
declare(strict_types=1);

$PINECALL_URL = getenv('PINECALL_URL') ?: 'https://box.pinecall.io';
$PINECALL_API_KEY = getenv('PINECALL_API_KEY') ?: 'pk_live_PASTE_YOUR_KEY_HERE';
// Which agents this endpoint mints for: a comma-separated list, or empty for every agent of the org.
$PINECALL_AGENTS = array_filter(array_map('trim', explode(',', (string) getenv('PINECALL_AGENTS'))));

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['detail' => 'POST only']);
    exit;
}
if (str_contains($PINECALL_API_KEY, 'PASTE_YOUR_KEY')) {
    http_response_code(500);
    echo json_encode(['detail' => 'token.php: put your Pinecall API key in $PINECALL_API_KEY']);
    exit;
}

$asked = json_decode((string) file_get_contents('php://input'), true);
$scope = (is_array($asked) && ($asked['scope'] ?? '') === 'chat') ? 'chat' : 'talk';
$agent = is_array($asked) ? (string) ($asked['agent'] ?? '') : '';
if ($agent === '' || ($PINECALL_AGENTS && !in_array($agent, $PINECALL_AGENTS, true))) {
    http_response_code(400);
    echo json_encode(['detail' => 'token.php: the widget must name an agent this site serves']);
    exit;
}

$curl = curl_init(rtrim($PINECALL_URL, '/') . '/v1/tokens');
curl_setopt_array($curl, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $PINECALL_API_KEY,
        'Content-Type: application/json',
        'Accept: application/json',
    ],
    CURLOPT_POSTFIELDS => json_encode([
        'agent' => $agent,
        'scope' => $scope,
        'ttl_s' => 60,
        'metadata' => ['page' => (string) ($_SERVER['HTTP_REFERER'] ?? ''), 'scope' => $scope],
    ]),
]);
$answer = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
if ($answer === false) {
    http_response_code(502);
    echo json_encode(['detail' => 'Pinecall did not answer: ' . curl_error($curl)]);
    exit;
}
http_response_code($status);
echo $answer;
