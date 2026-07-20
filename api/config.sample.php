<?php
/* Vorlage: nach config.php kopieren und Zugangsdaten eintragen. */

define('DB_HOST', 'localhost');
define('DB_NAME', 'DEIN_DATENBANK_NAME');
define('DB_USER', 'DEIN_DATENBANK_BENUTZER');
define('DB_PASS', 'DEIN_PASSWORT');

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]
        );
    }
    return $pdo;
}
