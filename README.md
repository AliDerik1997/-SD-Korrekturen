# FDN ÖSD Web-App v10

Installierbare, offline-fähige Arbeits- und Honorarverwaltung für iPhone, iPad und Desktop-Browser.

## Neu enthalten

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
- historische Honorarsätze, Dunkelmodus, Datenschutzmodus und vollständige Sicherung v5
- Anmeldung mit Apple-ID oder Google über einen eigenen Supabase-Cloudspeicher
- benutzergetrennte Datensätze mit Row-Level Security, Sitzungsverlängerung und Konfliktschutz
- automatische Wiederherstellung auf einem neuen Gerät; lokale Daten werden nie ohne Bestätigung ersetzt

## Installation auf dem iPhone

1. Die veröffentlichte HTTPS-Adresse in Safari öffnen.
2. **Teilen > Zum Home-Bildschirm** wählen.
3. **Als Web-App öffnen** aktivieren und hinzufügen.

Nach dem ersten vollständigen Laden funktioniert die App offline. Der Service Worker lädt bei einer neuen Version zuerst die aktuelle Startseite, damit Updates nicht mehr in einem alten Cache hängen bleiben.

## Anmeldung und Kontosicherung

Unter **Honorare > Dein Cloud-Konto** stehen **Mit Apple anmelden** und **Mit Google anmelden** bereit. Für die einmalige Aktivierung wird ein eigenes Supabase-Projekt benötigt. Dadurch gehören Cloud-Daten und Zugangskontrolle ausschließlich dem Betreiber der App.

Die vollständige Einrichtung steht in [CLOUD-SETUP.md](CLOUD-SETUP.md); das sichere Tabellenschema liegt in [supabase-setup.sql](supabase-setup.sql). Anmelde- und Aktualisierungstoken werden nie in JSON-, CSV-, Word- oder PDF-Dateien exportiert.

## Manueller Cloud-Abgleich

Unter **Honorare > Manuelle Synchronisierung** kann alternativ eine private HTTPS-Adresse eingetragen werden. Der Endpunkt muss dieselbe JSON-Datei per `GET` lesen und per `PUT` speichern sowie Zugriffe von der veröffentlichten Web-Adresse erlauben. Ein optionales Bearer-Token bleibt ausschließlich im lokalen Browser-Speicher.

Ohne eigenen Endpunkt funktionieren weiterhin JSON-Export und -Import über iCloud Drive. Das Format ist mit der nativen iPhone-App kompatibel.

## Datensicherheit

Ohne aktivierten Cloud-Abgleich bleiben alle Daten lokal auf dem Gerät. Vor dem Löschen der Web-App oder der Safari-Website-Daten regelmäßig eine Sicherung exportieren. Die App ist eine private Arbeitsübersicht und keine offizielle ÖSD-App.
