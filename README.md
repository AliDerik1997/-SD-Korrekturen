# ÖSD Korrektur – installierbare Web-App

Diese Version läuft als Progressive Web App (PWA) und benötigt keine siebentägige Apple-Signierung.

## Funktionen

- Monatskalender mit Auswahl jedes beliebigen Arbeitstages
- Erfassung aller sechs ÖSD-Auftragsarten
- Automatische Berechnung von Auftragszahl und Verdienst
- Verlauf mit Gesamtübersicht und Tagesdetails
- Monatsabrechnung mit automatischer Summe und vollständiger Tagesaufstellung
- Word-Abrechnung im Honorar-Tabellenstil sowie Excel-kompatible CSV-Liste
- Beide Dokumente über das iPhone-Teilen-Menü direkt an Mail übergeben
- Lokal gespeicherte Rechnungs-, E-Mail- und Bankdaten
- Bearbeitbare Honorarsätze
- Integrierter Taschenrechner
- Lokale Speicherung ohne Serverübertragung
- Export und Import einer Datensicherung
- Offline-Nutzung nach der ersten Installation

## Wichtig: zuerst veröffentlichen

Eine installierbare Web-App muss über eine HTTPS-Adresse aufgerufen werden. Die Dateien können beispielsweise auf GitHub Pages, Cloudflare Pages oder Netlify veröffentlicht werden. Das bloße Öffnen der `index.html`-Datei aus dem Finder reicht für die Installation und den Offline-Modus nicht aus.

### Einfache Veröffentlichung über Netlify Drop

1. Den Ordner `OSDKorrektur-WebApp` als ZIP-Datei bereithalten oder entpacken.
2. Im Browser `https://app.netlify.com/drop` öffnen.
3. Den kompletten entpackten Ordner auf die Seite ziehen.
4. Nach dem Upload die angezeigte HTTPS-Adresse auf dem iPhone in Safari öffnen.

Für eine dauerhaft gleichbleibende Adresse ist ein kostenloses Netlify-Konto erforderlich.

## Auf dem iPhone installieren

1. Die veröffentlichte HTTPS-Adresse in Safari öffnen.
2. Auf **Teilen** tippen.
3. **Zum Home-Bildschirm** auswählen.
4. **Als Web-App öffnen** aktivieren.
5. Auf **Hinzufügen** tippen.

Danach erscheint die App mit dem ÖSD-Symbol auf dem Home-Bildschirm. Nach dem ersten vollständigen Laden funktioniert sie auch offline.

## Datensicherheit

Die Arbeitsdaten liegen ausschließlich im lokalen Browser-Speicher des iPhones. Unter **Honorare > Datensicherung** sollte regelmäßig eine Sicherungsdatei exportiert und beispielsweise in iCloud Drive gespeichert werden. Das Löschen der Website-Daten in Safari oder das Entfernen der Web-App kann lokale Daten löschen.

Unter **Monat** wird jeder ausgewählte Monat sofort zusammengerechnet. Vor dem ersten Export dort den Namen, die E-Mail-Adresse und gegebenenfalls Bank, IBAN und BIC eintragen. Diese Angaben werden nicht im öffentlichen Web-Code gespeichert, sondern nur lokal auf dem jeweiligen Gerät.

## Lokaler Test am Mac

Im Ordner der Web-App einen lokalen Webserver starten, zum Beispiel:

```sh
python3 -m http.server 8080
```

Danach `http://localhost:8080` im Browser öffnen.
