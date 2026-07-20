# 🎮 NOAHSSPIELEECKE.EU — Installations-Anleitung (Hostinger)

## Was ist das?

- **Frontend:** Startseite + HTML5-Canvas-Spiele — laufen komplett im Browser
- **Backend:** PHP-API (`api/`) — speichert Highscores in der MySQL-Datenbank
- Die Highscore-Tabelle wird **automatisch angelegt** — kein SQL-Import nötig!

## Variante A: Upload per Dateimanager (5 Minuten)

1. **hPanel öffnen** → Website *noahsspieleecke.eu* → **Dateimanager**
2. In den Ordner **`public_html`** wechseln
3. Die Datei **`noahsspieleecke_upload.zip`** (liegt im Projektordner) hochladen
   und mit Rechtsklick → *Extract* direkt in `public_html` entpacken
4. Fertig! → **https://noahsspieleecke.eu** aufrufen und spielen 🎮

## Variante B: Git-Deployment (automatisch bei jedem Push)

1. hPanel → Website *noahsspieleecke.eu* → **Erweitert → GIT**
2. Repository: `https://github.com/tyrolerbua/noahsspieleecke.eu.git`, Branch `main`,
   Verzeichnis leer lassen (= `public_html`) → **Erstellen**
3. ⚠️ `api/config.php` ist **nicht im Repo** (absichtlich!). Einmalig im
   Dateimanager die Datei `public_html/api/config.php` anlegen und den Inhalt
   aus deiner lokalen `api/config.php` hineinkopieren.
4. Optional: In den GIT-Einstellungen den **Webhook** aktivieren, dann wird
   bei jedem `git push` automatisch neu deployed.

## Datenbank

Die Zugangsdaten stehen in `api/config.php`:

| Einstellung | Wert |
|---|---|
| Host | `localhost` |
| Datenbank | `u738582387_noah` |
| Benutzer | `u738582387_noah` |

Beim ersten API-Aufruf legt die API die Tabelle `highscores` selbst an.
In **phpMyAdmin** (Button im hPanel) kannst du sie danach ansehen.

## Testen, ob die API läuft

Im Browser aufrufen:

```
https://noahsspieleecke.eu/api/api.php?action=top&game=sterne
```

Erwartete Antwort: `{"ok":true,"top":[]}`

Falls stattdessen `{"ok":false,"error":"Datenbank nicht erreichbar"}` kommt:
Zugangsdaten in `api/config.php` prüfen (Tippfehler im Passwort?).

## ⚠️ Wichtige Sicherheitshinweise

1. **Passwort rotieren:** Das DB-Passwort wurde im Chat geteilt. Am besten im
   hPanel unter *Datenbanken* ein neues Passwort setzen und in `api/config.php`
   (lokal **und** auf dem Server) aktualisieren.
2. **Nicht zu GitHub pushen:** `api/config.php` steht in der `.gitignore`.
   Auf den Server gehört sie trotzdem — nur nicht ins öffentliche Repo.
   Als Vorlage liegt `config.sample.php` bei.

## Lokal testen (ohne Hostinger)

`index.html` über einen lokalen Webserver öffnen — die Spiele laufen komplett;
nur die Online-Highscores brauchen PHP. Ohne Server werden Scores automatisch
**lokal im Browser** gespeichert (Fallback).

Viel Spaß! ⭐
