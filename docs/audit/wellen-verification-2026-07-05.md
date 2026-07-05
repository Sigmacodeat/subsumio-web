# Verifikation: Wellen 1–5 + Nachtrags-Gaps (2026-07-05)

**Basis:** [implementation-spec-wellen-1-5.md](implementation-spec-wellen-1-5.md).
**Umfang:** 296 geänderte Dateien, ~40 neue `src/lib`-Module — fast jedes Modul entspricht
namentlich einem Spec-Punkt. **Das täuscht Vollständigkeit vor, die nicht da ist.**

**Ergebnis vorweg:** Technisch stabil (Typecheck clean, Build erfolgreich), aber **funktional
massiv unfertig**: Von ~28 geprüften neuen Modulen haben **17 exakt null Verbraucher** — keine
UI, keine API-Route, kein Test. Reiner Bibliothekscode ohne jede Anbindung ans Produkt. Zusätzlich
ein echter Test-Fehler und eine sicherheitsrelevante Lücke im wichtigsten Moat-Feature (Autopilot).

---

## Technischer Status

- `rm tsconfig.tsbuildinfo && npx tsc --noEmit` → **clean**.
- `npx vitest run` → **257 von 258 Dateien grün, 1 Datei schlägt fehl**:
  `src/lib/cron-auth.test.ts` — der Coverage-Guard-Test scannt `src/app/api/cron/*` nur eine
  Verzeichnisebene tief und findet keine `route.ts` in `cron/time-tracking/` (die tatsächliche
  Route liegt korrekt, aber verschachtelt unter `cron/time-tracking/inactivity-check/route.ts`).
  Kein funktionaler Fehler der Route selbst (sie läuft, ist in Crontab+Vercel korrekt
  eingetragen) — aber die Testsuite ist **nicht grün**, und der Guard-Test muss rekursiv gemacht
  werden, sonst schützt er zukünftige verschachtelte Cron-Routen gar nicht mehr.
- `npx next build` → **erfolgreich**.

## Vollständigkeits-Sweep: Wer wird tatsächlich benutzt?

Sweep über alle ~28 neuen `src/lib`-Module: hat irgendeine Dashboard-Seite oder API-Route
einen `import ... from "@/lib/<modul>"`?

| Kategorie                                                        | Module                                                                                                                                                                                                                                                                                                    | Zahl   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Voll verdrahtet** (UI + API + Tests vorhanden)                 | `absence`, `triage`, `passive-time`                                                                                                                                                                                                                                                                       | 3      |
| **API existiert, UI fehlt** (kein Lawyer kann es je erreichen)   | `online-booking`, `bulk-cases`, `fee-agreements`, `fachrechner`, `autonomous-queue`, `claim-account`, `autopilot`, `xjustiz`                                                                                                                                                                              | 8      |
| **Komplett verwaist** (0 UI, 0 API, 0 Tests — reiner toter Code) | `legal-insurance`, `credit-check`, `fax-gateway`, `pkh-beratungshilfe`, `peer-benchmark`, `datev-direct`, `letterhead-rubrum`, `kyc`, `outbound-register`, `document-interviews`, `red-team-agent`, `white-label`, `court-analytics`, `court-directory`, `dictation`, `fao-tracking`, `power-of-attorney` | **17** |

**Das heißt konkret:** RSV/drebis (B5), Bonitätsprüfung (F9), Fax-Gateway (F8), PKH/Beratungshilfe
(W5.11), Peer-Benchmarking (W5.5), DATEV-API-Anschluss (F10), Rubrum-Generator (F6), KYC (W5.15),
Postausgangsbuch (F7), Dokumenten-Interviews (W5.6), Red-Team-Agent (W5.3), White-Label-PWA
(W5.10), Entscheider-Analytics (W5.4), Gerichtsverzeichnis (F4), Diktat-Loop (W5.13),
FAO-Tracking (F11) und Vollmachten-Verwaltung (F5) — **17 der als "erledigt" markierbaren
Spec-Punkte existieren nur als isolierte, ungetestete Bibliotheksdatei ohne jede Anbindung.**
Aus Produktsicht ist keiner dieser 17 Punkte nutzbar. Das ist exakt das Muster, das wir schon
mehrfach in dieser Session gesehen haben (verwaiste Routen bea/translate/deep-analysis) — nur
diesmal in großem Maßstab.

---

## Tiefenprüfung der sicherheitskritischen/Flaggschiff-Punkte

### W1.1 XRechnung/ZUGFeRD — ✅ tatsächlich vollständig

Eigenes Modul `src/lib/e-invoice/` (7 Dateien: types, adapter, xrechnung, zugferd, qr-bill,
validator, index), 40 Tests grün, **in der UI verdrahtet**
(`InvoiceQuickCreateDialog.tsx:144,450-503,668-669` — Format-Dropdown, Auto-Download). Bestes
Ergebnis der gesamten Runde — echte Tiefe, echte Anbindung.

### W1.2 Sicherheit — ✅ solide

`scripts/check-route-actions.ts` läuft und ist in `bun run verify` verdrahtet (332 Routen
geprüft, alle mit gültigem Scope). Portal-Endpunkte haben Rate-Limiting (`clientIp` aus
`auth/rate-limit`). WhatsApp-Webhook verifiziert jetzt `X-Hub-Signature-256`.

### W1.3 E2E-Tests — ✅ vorhanden

4 von 5 spezifizierten Playwright-Specs existieren (`fristen-sync-flow`, `case-closeout`,
`client-portal-flow`, `invoice-billing`); DocuSign ist bewusst als Unit-Test abgedeckt
(`docusign-webhook.test.ts`), was laut Spec zulässig war ("kein Browser nötig").

### W2.1 Posteingang — ✅ Intake korrekt erweitert

`IntakeSource` um `bea`/`scan` ergänzt (§0.4-Regel befolgt — Bestandsseite erweitert statt
neu gebaut), `triage.ts` mit `triageMessage`/`triageBatch`, in der Intake-Seite verdrahtet.

### W2.2 beA-Versand — ⚠️ Modell da, aber ohne UI

`xjustiz.ts` baut korrekt gegen das bestehende `FilingPackage`-Modell aus
`efiling-architecture.ts` (§0.4 befolgt). Hat 3 API-Routen. **Aber: keine einzige
Dashboard-Seite ruft das auf** — ein Anwalt kann diesen Workflow durch die UI nicht auslösen.

### W2.3 Outlook/Kalender-Sync — ⚠️ nur pull, kein echtes bidirektional

`msgraph.ts` mit vollem Funktionsumfang (Calendar/Mail/Contacts-Sync, Token-Refresh). Der
Cron `outlook-sync` synchronisiert aber **nur einseitig Outlook → Subsumio**. Die Push-Funktion
`createCalendarEvent` existiert und hat eine API-Route (`api/outlook/calendar/create`) — diese
wird jedoch **von keiner UI-Komponente aufgerufen**, insbesondere nicht vom neuen
`calendar-editor.tsx`. Die im Plan geforderte Regel „Fristen sind in Outlook read-only,
Termine bidirektional" ist damit gegenstandslos, weil die Push-Richtung praktisch nicht genutzt
wird — nicht weil die Regel absichtlich beachtet wurde.

### W3.1 Autopilot-Loop (das Flaggschiff-Moat-Feature) — ❌ deutlich unterhalb der Spec

Das ist der größte Einzelbefund dieser Runde:

- Der Cron-Handler (`api/cron/autopilot/route.ts`) verarbeitet **ausschließlich den
  `new_intake`-Trigger**. Von den 4 in `DEFAULT_POLICIES` definierten Policies (Auto-Rundown bei
  Eingang, Frist-Warnung 48h, Dokument-Zusammenfassung, Stale-Rundown-Check) **feuern 3 von 4
  nie** — es gibt für `deadline_approaching`, `document_uploaded` und `rundown_stale` keinen
  Verarbeitungspfad im Cron. Totes Policy-Konfigurationsobjekt.
- **Kein Budget-Cap** — die Spec verlangte explizit einen Cent-Cap pro Nacht mit Testfall
  "Budget-Überschreitung bricht sauber ab"; im Code: nicht vorhanden.
- **Kein Kill-Switch** (`DISABLE_AUTOPILOT_CRON`) — nicht vorhanden.
- **Keine Rundown-Integration** — der spezifizierte Pflichtabschnitt „🤖 Über Nacht
  vorbereitet" fehlt im Rundown-Prompt komplett.
- **Kein Test** für das Modul oder den Cron.
- Die zentrale Sicherheitsgarantie der Spec („Kein einziger Schritt hat etwas OHNE
  Approval-Gate final gestellt") ist **nicht verifizierbar** — der Cron ruft nur generisch
  `/api/agents` mit einem Prompt auf; ob das Ergebnis zwingend in einem Vier-Augen-Approval-Gate
  landet, hängt von downstream-Code ab, der hier nicht sichtbar/geprüft ist.

### W3.2 Passive Zeiterfassung — ⚠️ Kern da, Datenschutz-Anforderung fehlt

`passive-time.ts` mit `generateTimeSuggestions`, Cron korrekt in beiden Configs eingetragen
(`0 19 * * *`), UI-Anbindung vorhanden (1 Dashboard-Konsument). **Aber:** die explizit
geforderte Opt-in-Prüfung pro Nutzer ("Feature ist opt-in... Signale bleiben im eigenen Brain")
ist im Code nicht auffindbar — es gibt keinen sichtbaren Enable/Disable-Schalter, den der Cron
respektiert.

### W4.1 FiBu — ⚠️ Matching-Logik da, kein echter Bank-Feed

`fibu.ts` hat vollständige OPOS-/Dunning-/Matching-Logik (`autoMatchTransaction`,
`applyMatch`, Mahnstufen 0-3), verdrahtet unter `dashboard/fibu/page.tsx`, Dunning-Cron korrekt
in beiden Configs. **Aber:** die spezifizierte Bank-Feed-Anbindung (`BankFeedProvider`-Interface,
Open-Banking-Aggregator) **existiert nicht** — `autoMatchTransaction` kann nur gegen manuell
angelegte `BankTransaction`-Datensätze matchen, es gibt keine automatische Kontoabfrage. Der
Kernnutzen ("Zahlungseingang automatisch erkannt") ist damit nicht erreichbar, nur die
Verarbeitung danach.

### W4.2 Mahnverfahren/ZV — ✅ Kernlogik gut, UI fehlt

`claim-account.ts` hat vollständige §367-BGB-Verrechnung, Mahnbescheid→Vollstreckungsbescheid-
Statuskette, ZV-Maßnahmen. Aber: **keine UI**, nur 1 API-Route — nicht durch das Dashboard
erreichbar.

### W4.3 Fachrechner — ✅ Rechenlogik vollständig, ⚠️ kein Zugang

Alle 6 spezifizierten Rechner vorhanden (`calculateGkg`, Familienrecht, Arbeitsrecht,
Verkehrsrecht, Mietrecht, Erbrecht). **Kein `dashboard/rechner`-Hub, keine UI überhaupt** — nur
1 API-Route. Ein Anwalt hat aktuell keine Möglichkeit, diese Rechner zu benutzen.

---

## Gesamtbild

| Dimension                                    | Befund                                                                                                                                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                                    | ✅ clean                                                                                                                                                                                                         |
| Tests                                        | ⚠️ 257/258 grün (1 Infrastruktur-Testbug, kein Feature-Bug)                                                                                                                                                      |
| Build                                        | ✅ erfolgreich                                                                                                                                                                                                   |
| **Tatsächlich nutzbare neue Features**       | **3 von ~28** (`absence`, `triage`, `passive-time` — Letzteres mit Datenschutz-Lücke)                                                                                                                            |
| **Backend fertig, UI fehlt komplett**        | 8 Module (u. a. beA-Versand, Fachrechner, Mahnverfahren, Autopilot-Konfiguration)                                                                                                                                |
| **Komplett verwaist (0 Anbindung, 0 Tests)** | 17 Module                                                                                                                                                                                                        |
| **Kritischster Einzelbefund**                | Autopilot (W3.1) — das als Innovations-Moat positionierte Flaggschiff-Feature läuft zu 75% gar nicht (3 von 4 Policies tot), hat keinen Budget-Cap, keinen Kill-Switch, keine verifizierbare Vier-Augen-Garantie |

**Einordnung:** Das ist nicht "fast fertig, ein paar Kleinigkeiten fehlen" — das ist eine sehr
große Menge an gut geschriebenem, isoliertem Backend-Code, der zu über 60% (17 von 28 Modulen)
**für den Nutzer schlicht nicht existiert**. Die 296 geänderten Dateien und die
namensgleiche 1:1-Abdeckung der Spec-Punkte haben Vollständigkeit vorgetäuscht, die eine
oberflächliche Prüfung (nur „gibt es die Datei") bestätigt hätte — deshalb war der Sweep
(„wer importiert das eigentlich") hier entscheidend.

## Was jetzt zu tun ist (priorisiert)

1. **`cron-auth.test.ts` reparieren** (Guard rekursiv machen) — 10 Minuten, sonst bleibt die
   Suite rot und der Guard schützt zukünftige verschachtelte Cron-Routen nicht mehr.
2. **Autopilot (W3.1) nachziehen, bevor es als „Moat-Feature" kommuniziert wird:** alle 4
   Trigger-Typen tatsächlich verarbeiten, Budget-Cap + Kill-Switch + Rundown-Integration + Test
   ergänzen, Vier-Augen-Garantie explizit verifizieren (nicht annehmen).
3. **Für die 8 „Backend fertig, UI fehlt"-Module:** UI bauen oder — falls aktuell nicht
   priorisiert — das explizit als bewusst zurückgestellt dokumentieren, damit es nicht
   fälschlich als „erledigt" gilt.
4. **Für die 17 komplett verwaisten Module:** entscheiden, ob sie in dieser Phase überhaupt
   noch gebraucht werden. Wenn ja: UI + Tests nachziehen. Wenn nein: als YAGNI-Code klar
   markieren oder entfernen, statt sie als stillen „Erledigt"-Fakt im Repo stehen zu lassen.
5. **FiBu-Bank-Feed** nachrüsten — ohne echten Kontoabgleich ist der Matching-Code Papier.
6. **Outlook-Push tatsächlich in `calendar-editor.tsx` verdrahten**, sonst ist der
   Zwei-Wege-Sync nur auf dem Papier bidirektional.
