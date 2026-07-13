# FDN ÖSD Web-App v9

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
- historische Honorarsätze, Dunkelmodus, Datenschutzmodus und vollständige Sicherung v4

## Installation auf dem iPhone

1. Die veröffentlichte HTTPS-Adresse in Safari öffnen.
2. **Teilen > Zum Home-Bildschirm** wählen.
3. **Als Web-App öffnen** aktivieren und hinzufügen.

Nach dem ersten vollständigen Laden funktioniert die App offline. Der Service Worker lädt bei einer neuen Version zuerst die aktuelle Startseite, damit Updates nicht mehr in einem alten Cache hängen bleiben.

## Cloud-Abgleich

Unter **Honorare > Cloud-Synchronisierung** kann eine private HTTPS-Adresse eingetragen werden. Der Endpunkt muss dieselbe JSON-Datei per `GET` lesen und per `PUT` speichern sowie Zugriffe von der veröffentlichten Web-Adresse erlauben. Ein optionales Bearer-Token bleibt ausschließlich im lokalen Browser-Speicher.

Ohne eigenen Endpunkt funktionieren weiterhin JSON-Export und -Import über iCloud Drive. Das Format ist mit der nativen iPhone-App kompatibel.

## Datensicherheit

Ohne aktivierten Cloud-Abgleich bleiben alle Daten lokal auf dem Gerät. Vor dem Löschen der Web-App oder der Safari-Website-Daten regelmäßig eine Sicherung exportieren. Die App ist eine private Arbeitsübersicht und keine offizielle ÖSD-App.
