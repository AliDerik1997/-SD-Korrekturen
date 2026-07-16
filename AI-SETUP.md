# FDN ÖSD KI einrichten

Die App besitzt bereits einen lokalen Offline-Assistenten. Dafür sind weder Konto noch API-Schlüssel nötig. Der optionale Cloud-Modus kann natürlichere Tagesanalysen, Monatspläne und E-Mail-Entwürfe erzeugen.

## Warum ein eigener Gateway nötig ist

Ein OpenAI-API-Schlüssel darf niemals in einer iPhone-App, Web-App oder einem öffentlichen GitHub-Repository liegen. Deshalb spricht FDN ÖSD nur mit einer eigenen HTTPS-Adresse. Erst dieser Server ruft OpenAI auf und liest den Schlüssel aus einer geschützten Umgebungsvariable.

GitHub Pages kann ausschließlich statische Dateien ausliefern und eignet sich nicht zum Verwahren eines geheimen Schlüssels. Die mitgelieferte Datei `ai-gateway-cloudflare-worker.js` ist eine Vorlage für einen kleinen Cloudflare Worker; dieselbe Logik kann auch auf Vercel, Netlify oder einem eigenen Server laufen.

## Cloudflare-Worker in Kurzform

1. Einen neuen Worker anlegen und den Inhalt von `ai-gateway-cloudflare-worker.js` einsetzen.
2. In den Worker-Einstellungen diese verschlüsselten Secrets anlegen:
   - `OPENAI_API_KEY`: eigener OpenAI-API-Schlüssel
   - `AI_GATEWAY_TOKEN`: ein langes, selbst gewähltes Zufallstoken
3. Als normale Variable `ALLOWED_ORIGIN` nur den Ursprung der GitHub-Pages-Adresse setzen, beispielsweise `https://NAME.github.io` (ohne Repository-Pfad und ohne abschließenden Schrägstrich).
4. Optional `OPENAI_MODEL` setzen; ohne Angabe verwendet die Vorlage `gpt-5.6-luna` für ein gutes Verhältnis aus Qualität, Geschwindigkeit und Kosten.
5. Worker veröffentlichen und seine HTTPS-Adresse kopieren.
6. In FDN ÖSD unter **Honorare > KI & Datenschutz** die Worker-Adresse und das `AI_GATEWAY_TOKEN` eintragen, Cloud-KI aktivieren und die Verbindung testen.
7. In der nativen App stehen dieselben Felder unter **Honorare > Version-16-KI-Assistent**.

## Übertragene Daten

Der Gateway akzeptiert nur eine feste Whitelist aus Anzahl, Verdienst, Arbeitszeit, Zielwerten, offener Auftragssumme und Fristdaten. Namen, E-Mail-Adressen, IBAN/BIC, Bank, Tagesnotizen, Auftragstitel und Anhänge werden bereits in der App ausgeschlossen und im Gateway ein zweites Mal verworfen.

Die Antwort wird serverseitig als festes JSON-Schema mit Zusammenfassung, Warnungen, nächstem Schritt und optionalem E-Mail-Entwurf angefordert und danach erneut begrenzt. Dadurch müssen App und Web-App keine freie, unvorhersehbare Antwortstruktur interpretieren.

Fällt der Gateway aus oder ist er falsch eingerichtet, zeigt FDN ÖSD automatisch die lokale Offline-Analyse. Der OpenAI-Schlüssel wird an keiner Stelle in der App gespeichert oder exportiert.
