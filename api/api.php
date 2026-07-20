<?php
/* =========================================================
   NOAHSSPIELEECKE.EU — Highscore-API (für alle Spiele)
   GET  api.php?action=top&game=sterne      → Top 10 des Spiels
   POST {action:"submit", game, name, score}
   ========================================================= */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require __DIR__ . '/config.php';

/* Erlaubte Spiele und maximale plausible Punktzahl je Spiel */
const GAMES = [
    'sterne' => 100000,
    'rennen' => 10000000,   // Score = Kontostand der Karriere
];

function out(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function ensureTable(PDO $pdo): void {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS highscores (
            id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            game       VARCHAR(32)  NOT NULL,
            name       VARCHAR(24)  NOT NULL,
            score      INT UNSIGNED NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_game_score (game, score DESC)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

function topList(PDO $pdo, string $game): array {
    $stmt = $pdo->prepare(
        'SELECT name, score, DATE(created_at) AS created_at
         FROM highscores WHERE game = :g ORDER BY score DESC, created_at ASC LIMIT 10'
    );
    $stmt->execute([':g' => $game]);
    return $stmt->fetchAll();
}

try {
    $pdo = db();
    ensureTable($pdo);
} catch (Throwable $e) {
    out(['ok' => false, 'error' => 'Datenbank nicht erreichbar'], 500);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/* ---------- Bestenliste abrufen ---------- */
if ($method === 'GET') {
    if (($_GET['action'] ?? '') !== 'top') {
        out(['ok' => false, 'error' => 'Unbekannte Aktion'], 400);
    }
    $game = (string)($_GET['game'] ?? '');
    if (!isset(GAMES[$game])) {
        out(['ok' => false, 'error' => 'Unbekanntes Spiel'], 422);
    }
    out(['ok' => true, 'top' => topList($pdo, $game)]);
}

/* ---------- Score eintragen ---------- */
if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data) || ($data['action'] ?? '') !== 'submit') {
        out(['ok' => false, 'error' => 'Ungültige Anfrage'], 400);
    }

    $game  = (string)($data['game'] ?? '');
    $name  = mb_substr(strip_tags(trim((string)($data['name'] ?? ''))), 0, 20);
    $score = (int)($data['score'] ?? -1);

    if (!isset(GAMES[$game]))            out(['ok' => false, 'error' => 'Unbekanntes Spiel'], 422);
    if (mb_strlen($name) < 2)            out(['ok' => false, 'error' => 'Name zu kurz'], 422);
    if ($score < 0 || $score > GAMES[$game]) out(['ok' => false, 'error' => 'Ungültige Punktzahl'], 422);

    $stmt = $pdo->prepare('INSERT INTO highscores (game, name, score) VALUES (:g, :n, :s)');
    $stmt->execute([':g' => $game, ':n' => $name, ':s' => $score]);

    $rk = $pdo->prepare('SELECT COUNT(*) + 1 FROM highscores WHERE game = :g AND score > :s');
    $rk->execute([':g' => $game, ':s' => $score]);

    out(['ok' => true, 'rank' => (int)$rk->fetchColumn(), 'top' => topList($pdo, $game)]);
}

out(['ok' => false, 'error' => 'Methode nicht erlaubt'], 405);
