# FDN ÖSD Web-App Version 17 – Veröffentlichung

1. Alle Dateien dieses Ordners in das GitHub-Pages-Repository hochladen.
2. Prüfen, dass `advanced-v16.js`, `advanced-v17.js` und `service-worker.js` veröffentlicht wurden.
3. Seite einmal online öffnen und anschließend einen Offline-Start testen.
4. Für Apple-/Google-/E-Mail-Anmeldung `CLOUD-SETUP.md` vollständig durchführen.
5. Für automatischen Versand einen eigenen HTTPS-Mail-Webhook eintragen und zunächst **Verbindung testen** verwenden.
6. Keine Service-Role-Schlüssel, privaten Tokens oder Bankdaten in GitHub speichern.
7. Für Cloud-KI den OpenAI-Schlüssel ausschließlich als Server-Secret hinterlegen, danach lokale Analyse, Cloud-Analyse und automatischen Fallback testen.
8. Im V17-Systemzentrum einen IndexedDB-Checkpoint erstellen, App neu öffnen und die Wiederherstellung mit Testdaten prüfen.

Die Rechnungsampel blockiert Exporte mit fehlenden Pflichtdaten. Eine bestehende v8-Sicherung kann weiterhin eingelesen und wird beim nächsten Export als v9 gespeichert.
