# DATEV-Direktanbindung — was für eine echte Integration fehlt

## Ist-Zustand (2026-07)

`src/lib/datev-direct.ts` + `src/app/api/datev-direct/route.ts` +
`src/app/dashboard/datev-direct/page.tsx` bilden eine Seite, die früher als
"DATEV Direct" (direkte Übertragung an DATEV) beworben wurde. Tatsächlich:

- `isDatevConfigured()` prüft nur, ob `DATEV_API_KEY`, `DATEV_CLIENT_ID` und
  `DATEV_CLIENT_SECRET` gesetzt sind. Das ist ein reiner Env-Var-Check —
  keine Anfrage an DATEV, keine Authentifizierung, keine Validierung der Werte.
- Die POST-Route erzeugt einen internen Export-Datensatz (Rechnungs-/
  Buchungsdaten als JSON, gespeichert als Engine-Page) und ließ den Status
  früher fälschlich auf `"sent"` springen, sobald die Env-Vars gesetzt waren
  — unabhängig davon, ob überhaupt ein Netzwerk-Request stattfand. Es gibt
  keinen Code-Pfad, der einen HTTP-Request an eine DATEV-API absetzt.
- Der reale, funktionierende Export ist `src/lib/datev-export.ts` +
  `/dashboard/datev-export`: erzeugt eine DATEV-kompatible CSV
  (SKR03/SKR04/SKR49) zum manuellen Import in DATEV Unternehmen Online, mit
  Download- und Copy-Button. Das ist kein Fake — es ist einfach kein
  API-Direktanschluss, sondern ein Datei-Export.

Diese Datei dokumentiert, was zusätzlich gebraucht würde, um `datev-direct`
zu einer echten API-Anbindung zu machen. Kein Code hier — nur die
Anforderungen, damit ein Mensch mit DATEV-Partnerzugang das gezielt umsetzen
kann.

## Was für eine echte Direktanbindung fehlt

1. **DATEV-Partnerschaft / Marketplace-Zulassung.** DATEV vergibt API-Zugang
   nur an registrierte Software-Partner (DATEV Marketplace / DATEV
   Schnittstellenpartner-Programm). Ohne diesen Status gibt es keine
   Produktions-Credentials — nur eine Sandbox, wenn überhaupt.
2. **Welche DATEV-API konkret.** Für Kanzlei-/Steuerberater-Buchhaltung
   kommen zwei Kandidaten in Frage:
   - **DATEV Rechnungsdatenservice** (Belege/Rechnungen strukturiert
     einliefern, Ersatz für den klassischen CSV-Import) — passt zum
     `invoicesToDatevRecords`-Datenmodell in diesem Repo.
   - **DATEV Unternehmen Online API** (Buchungsdaten, Stammdaten,
     Belegbilder) — breiter, aber auch der aufwendigere Zulassungsprozess.
     Beide sind Teil des DATEV-Entwicklerportals (`developer.datev.de`), nicht
     öffentlich ohne Partnervertrag dokumentiert im Detail.
3. **OAuth2-Flow.** DATEV-APIs laufen über OAuth2 (Authorization Code oder
   Client-Credentials, je nach API) gegen den DATEV-Identity-Provider. Das
   bedeutet: Redirect-/Consent-Flow für den Endnutzer (Kanzlei autorisiert
   Subsumio gegenüber DATEV), Token-Refresh-Handling, sicheres
   Credential-Storage (nicht nur `DATEV_CLIENT_ID`/`DATEV_CLIENT_SECRET` als
   globale Server-Env-Vars, sondern pro-Kanzlei-Token, da jede Kanzlei ihren
   eigenen DATEV-Mandanten hat).
4. **Datenmapping-Vertrag.** DATEV-APIs erwarten spezifische Schemas
   (Belegformat, Kontenrahmen-Referenzen, Steuerschlüssel-Codes) — das
   bestehende `DatevInvoiceRecord`/`DatevBookingRecord`-Mapping in
   `datev-direct.ts` ist eine Annäherung an das CSV-Format, nicht an das
   API-Schema. Das Mapping müsste gegen die tatsächliche API-Spezifikation
   validiert werden (Feldnamen, Pflichtfelder, Formate unterscheiden sich).
5. **Fehlerbehandlung + Statuskorrelation.** Eine echte Anbindung braucht
   Retry-Logik, Idempotenz (keine doppelte Übertragung bei Netzwerkfehlern),
   und einen echten `datev_reference` aus der DATEV-Antwort statt eines
   selbst generierten Platzhalters — der Status `"sent"`/`"confirmed"` darf
   erst gesetzt werden, wenn DATEV das tatsächlich bestätigt hat.
6. **GoBD-/Testat-Anforderungen.** Da es um Buchhaltungsdaten geht, muss die
   Übertragung nachvollziehbar und unveränderbar protokolliert werden
   (Audit-Trail, wer wann was mit welchem DATEV-Ergebnis übertragen hat) —
   relevant für die GoBD-Konformität, die an anderer Stelle im Produkt schon
   Thema ist (`docs/audits/STEUERBERATER_UMBAU_ANALYSE_2026.md`).

## Geschätzter Aufwand

Frühere interne Schätzung (`docs/audits/STEUERBERATER_UMBAU_ANALYSE_2026.md`,
Abschnitt 2.9): **2-4 Wochen**, vorausgesetzt DATEV-Partnerzugang und
API-Zugangsdaten liegen bereits vor. Der Partnerschaftsprozess selbst
(Bewerbung, Zertifizierung, Freigabe durch DATEV) liegt außerhalb der
Entwicklungszeit und kann deutlich länger dauern.

## Bis dahin

`/dashboard/datev-direct` ist im Nav als `comingSoon` markiert und zeigt einen
"in Entwicklung"-Hinweis. Nutzer werden auf `/dashboard/datev-export` (CSV,
funktioniert) verwiesen.
