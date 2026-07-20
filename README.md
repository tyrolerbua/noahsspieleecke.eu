# 🎮 Noahs Spieleecke — noahsspieleecke.eu

Browser-Spiele für Noah, gehostet auf Hostinger.

- **Frontend:** HTML5/Canvas-Spiele — laufen komplett im Browser
- **Backend:** PHP-Highscore-API (`api/`) mit MySQL-Datenbank
- **Erstes Spiel:** ⭐ Sternenfänger (`games/sterne/`)

## Struktur

```
index.html          Startseite mit Spieleauswahl
css/style.css       Gemeinsames Stylesheet
games/sterne/       Spiel: Sternenfänger
api/api.php         Highscore-API (GET top / POST submit)
api/config.php      DB-Zugangsdaten (NICHT im Repo — siehe .gitignore)
api/config.sample.php  Vorlage für config.php
```

Deployment-Anleitung: siehe [ANLEITUNG.md](ANLEITUNG.md)

## Neues Spiel hinzufügen

1. Ordner `games/<name>/` mit `index.html` + `game.js` anlegen
2. Spiel-ID in `api/api.php` in der `GAMES`-Konstante eintragen (mit Max-Score)
3. Karte auf der Startseite (`index.html`) ergänzen
