# FDN ÖSD Web-App v17

Installierbare, offline-fähige Arbeits- und Honorarverwaltung für iPhone, iPad und Desktop-Browser.

## Neu enthalten

- transaktionale IndexedDB-Checkpoints mit SHA-256-Prüfsumme und acht rollierenden Wiederherstellungspunkten
- Systemqualitätswert für Daten, Rechnungen, Fristen, Offline-Betrieb und Browser-Datenbank
- kompatible Doppel-Sicherung: bisheriger Browser-Speicher plus professionelle Checkpoint-Datenbank
- strukturierte KI-Antworten mit festem Schema für Zusammenfassung, Hinweise, nächsten Schritt und E-Mail-Entwurf
- aktualisierter privater KI-Gateway mit `gpt-5.6-luna` als kostensensitivem Standardmodell
- KI-Assistent für Tagesanalyse, Monatsplanung und professionelle E-Mail-Entwürfe
- sofort nutzbarer Offline-Modus ohne Konto, Internet oder Zusatzkosten
- optionaler OpenAI-Modus über einen eigenen sicheren HTTPS-Gateway, niemals mit API-Schlüssel im Browser
- strikte KI-Datensparsamkeit: keine Namen, E-Mails, Bankdaten, Notizen, Auftragstitel oder Anhänge
- Finanzzentrale mit Jahresumsatz, bezahlten/offenen Honorarnoten und Betrag nach Steuerrücklage
- Rechnungsampel mit Export-Sperre bei fehlenden Pflichtangaben, unplausibler IBAN oder doppelter Rechnungsnummer
- dauerhaftes, geräteübergreifendes Änderungsprotokoll für Arbeitstage, Aufträge, Importe und Rechnungen
- Automatisierungsdiagnose für Cloud-Konto, Synchronisierung, Mailversand und Geräteschutz
- verbesserter E-Mail-Import mit Auftraggebererkennung, Planzeit und Duplikatschutz
- migrationsfähige Sicherung v9; ältere Sicherungen bleiben importierbar
- Zieltempo pro verbleibendem Wochentag und Restbetrag bis zum Monatsziel
- Cashflow-Anzeige für offene und überfällige Honorarnoten
- teilbare Tageszusammenfassung mit Aufträgen, Verdienst, Zeit und Notiz
- frei planbare Bearbeitungszeit für offene Aufträge
- Abschlussprüfung für Rechnungsdaten und vergessene Arbeitstage
- korrigierte Anmeldung, echte Tagessperre, getrennte Auftraggeber-Rechnungen und automatische App-Aktualisierung
- Wochenziel und Monatsverdienstziel mit übersichtlichem Fortschritt
- produktive Serie, intelligente nächste Aufgabe und Auslastungsampel
- Tagesnotizen und sicher abschließbare Arbeitstage
- Auftraggeber-Verteilung des aktuellen Monats
- Arbeitscockpit mit Tagesziel, Restzeit, Monatsprognose, Rücklage und verfügbarem Betrag
- einfache Anmeldung per E-Mail-Code oder lokaler Gastmodus zusätzlich zu Apple und Google
- Foto-/Screenshot-Erfassung mit Browser-Texterkennung und iPhone-Live-Text-Hilfe
- mehrere Auftraggeber mit eigenen Preisen, Kontaktdaten, Rechnungspräfixen und Abrechnungsfilter
- automatische Datenprüfung, drei lokale Wiederherstellungspunkte und sichtbarer Synchronisationsstatus
- geführte Einführung in die wichtigsten Funktionen

- Arbeitszeit-Timer mit effektivem Stundenlohn
- offene Aufträge, Abgabefristen und Erledigt-Status
- wiederverwendbare Schnellvorlagen
- Monats- und Jahresstatistik mit Niveauvergleich
- automatische Monatsentwürfe und Rechnungsarchiv mit `Entwurf`, `Versendet`, `Bezahlt`
- fortlaufende Rechnungsnummern, Zahlungsziel, Absenderadresse und optionaler Steuerhinweis
- PDF-Druckansicht, Word und Excel-kompatible CSV
- CSV-/Excel-Import im Format `Datum;Kategorie;Anzahl;Honorar`
- geräteübergreifender JSON-Abgleich über eine private HTTPS-Adresse mit GET/PUT
- Startbildschirm-Schnellaktionen und kompakte Tagesübersicht
- historische Honorarsätze, Dunkelmodus, Datenschutzmodus und vollständige Sicherung v8
- Anmeldung mit Apple-ID oder Google über einen eigenen Supabase-Cloudspeicher
- benutzergetrennte Datensätze mit Row-Level Security, Sitzungsverlängerung und Konfliktschutz
- automatische Wiederherstellung auf einem neuen Gerät; lokale Daten werden nie ohne Bestätigung ersetzt
- Ende-zu-Ende-Verschlüsselung mit AES-256-GCM und HKDF-SHA256
- ÖSD-E-Mail-Import, Fotos/PDF-Belege, Suche, Jahresübersicht und Versionsgeschichte
- automatische E-Mail-Übergabe, Frist- und Zahlungserinnerungen sowie Geräteschutz
- vier Farbwelten, große Schrift und kompakte Startseite

E-Mail-/Apple-/Google-Anmeldung, vollautomatischer Mailversand, Cloud-KI und echte Hintergrund-Push-Mitteilungen benötigen eigene Cloud-/OAuth-/Mail-/Gateway-Zugangsdaten. Ohne diese Dienste bleiben Gastmodus, Offline-KI, lokale Funktionen und manuelles Teilen vollständig nutzbar.

## KI-Assistent

Auf der Startseite stehen **Tag**, **Monat** und **E-Mail** bereit. Standardmäßig werden die Texte lokal aus den vorhandenen Summen erzeugt. Die optionale Einrichtung für OpenAI steht in [AI-SETUP.md](AI-SETUP.md); die sichere Servervorlage liegt in [ai-gateway-cloudflare-worker.js](ai-gateway-cloudflare-worker.js).

## Installation auf dem iPhone

1. Die veröffentlichte HTTPS-Adresse in Safari öffnen.
2. **Teilen > Zum Home-Bildschirm** wählen.
3. **Als Web-App öffnen** aktivieren und hinzufügen.

Nach dem ersten vollständigen Laden funktioniert die App offline. Version 17 besitzt einen neuen Offline-Cache; zusätzlich hält die Browser-Datenbank bis zu acht lokal geprüfte Checkpoints bereit.

## Anmeldung und Kontosicherung

Unter **Honorare > Dein Cloud-Konto** stehen E-Mail-Code, Apple und Google bereit. Für die einmalige Aktivierung wird ein eigenes Supabase-Projekt benötigt. Dadurch gehören Cloud-Daten und Zugangskontrolle ausschließlich dem Betreiber der App.

Die vollständige Einrichtung steht in [CLOUD-SETUP.md](CLOUD-SETUP.md); das sichere Tabellenschema liegt in [supabase-setup.sql](supabase-setup.sql). Anmelde- und Aktualisierungstoken werden nie in JSON-, CSV-, Word- oder PDF-Dateien exportiert.

## Manueller Cloud-Abgleich

Unter **Honorare > Manuelle Synchronisierung** kann alternativ eine private HTTPS-Adresse eingetragen werden. Der Endpunkt muss dieselbe JSON-Datei per `GET` lesen und per `PUT` speichern sowie Zugriffe von der veröffentlichten Web-Adresse erlauben. Ein optionales Bearer-Token bleibt ausschließlich im lokalen Browser-Speicher.

Ohne eigenen Endpunkt funktionieren weiterhin JSON-Export und -Import über iCloud Drive. Das Format ist mit der nativen iPhone-App kompatibel.

## Datensicherheit

Ohne aktivierten Cloud-Abgleich bleiben alle Daten lokal auf dem Gerät. Die V17-Checkpoints helfen bei versehentlichen Änderungen, werden aber zusammen mit Safari-Website-Daten gelöscht. Deshalb vor dem Löschen der Web-App weiterhin eine Sicherheitskopie exportieren. Die App ist eine private Arbeitsübersicht und keine offizielle ÖSD-App.

## E-Mail-Webhook

Die App sendet per `POST` JSON an die eingetragene HTTPS-Adresse. Enthalten sind Empfänger, Betreff, Monat, Gesamtsumme und Base64-Dateien; `createPDF: true` bittet den Dienst, zusätzlich eine PDF aus dem HTML-Dokument zu erzeugen. Optional wird `Authorization: Bearer …` gesetzt. Token bleiben lokal und sind nie Teil einer Sicherung.
