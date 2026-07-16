# FDN ÖSD – Cloud-Konto aktivieren

Die App verwendet ein eigenes Supabase-Projekt als Identitäts- und Datenspeicher. Dadurch sieht jedes angemeldete Konto ausschließlich den eigenen Datensatz.

## 1. Supabase-Projekt

1. Ein Projekt unter `https://supabase.com` anlegen.
2. Im SQL Editor den Inhalt von `supabase-setup.sql` einmal ausführen.
3. Unter **Project Settings > API** die **Project URL** und den öffentlichen **anon/publishable key** kopieren.
4. Beide Werte in FDN ÖSD unter **Honorare > Dein Cloud-Konto > Einmalige Cloud-Einrichtung** eintragen.

Der öffentliche Schlüssel darf in einer App stehen. Der `service_role`-Schlüssel darf dagegen niemals in die App, in GitHub oder in eine Sicherung kopiert werden.

## 2. E-Mail-Code aktivieren

Unter **Supabase > Authentication > Providers > Email** den E-Mail-Anbieter aktivieren. Die E-Mail-Vorlage muss den Supabase-Token anzeigen, damit der sechsstellige Code direkt in FDN ÖSD eingegeben werden kann.

## 3. Google aktivieren (optional)

1. In Google Cloud eine OAuth-Webanwendung erstellen.
2. Die von Supabase angezeigte Callback-URL als autorisierte Weiterleitungs-URL eintragen.
3. Client-ID und Client-Secret unter **Supabase > Authentication > Providers > Google** hinterlegen und Google aktivieren.

## 4. Apple aktivieren (optional)

Für „Mit Apple anmelden“ ist eine Apple-Developer-Mitgliedschaft erforderlich. In Apple Developer eine Services-ID und den Sign-in-with-Apple-Schlüssel anlegen. Die Supabase-Callback-Domain und Callback-URL hinterlegen. Anschließend Services-ID, Team-ID, Key-ID und privaten Schlüssel unter **Supabase > Authentication > Providers > Apple** eintragen.

## 5. Erlaubte Rücksprungadressen

Unter **Supabase > Authentication > URL Configuration** eintragen:

- `https://aliderik1997.github.io/-SD-Korrekturen/`
- `fdnosd://auth-callback`

Die GitHub-Pages-Adresse als Site URL verwenden. Für lokale Tests können bei Bedarf weitere Redirect URLs ergänzt werden.

## Sicherheitsverhalten

- Row-Level Security bindet jeden Datensatz an `auth.uid()`.
- Auf einem leeren Gerät wird die Kontosicherung automatisch geladen.
- Existieren lokal und in der Cloud unterschiedliche Daten, fragt die App vor dem Ersetzen.
- Erkennt die automatische Sicherung Änderungen von einem anderen Gerät, stoppt sie und verlangt zuerst eine bewusste Entscheidung.
- Anmeldetoken sind nicht Teil der portablen FDN-ÖSD-Sicherung.
