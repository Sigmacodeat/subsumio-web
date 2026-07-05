# Gesamtaudit: Aktueller Stand des Kanzlei-OS (2026-07-05, zweiter Durchgang)

**Methode:** Anbindungs-Sweep über alle ~28 neuen Module (wer importiert was — UI vs. API vs.
Test), Erreichbarkeits-Prüfung aller Dashboard-Routen (Sidebar/Command-Palette/Hubs),
Substanz-Stichproben in die neuen UIs, Nachprüfung aller 6 Mängel aus
[wellen-verification-2026-07-05.md](wellen-verification-2026-07-05.md), technischer Dreiklang.

---

## 1. Technischer Status

| Prüfung                         | Ergebnis                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsc --noEmit` (Cache gelöscht) | ✅ clean                                                                                                                                                                                                                                                                                                                                                                                              |
| `vitest run` komplett           | ✅ **279 Dateien / 5026 Tests grün** (+21 Dateien, +116 Tests seit letzter Runde — u. a. der zuvor rote `cron-auth.test.ts` jetzt rekursiv und grün)                                                                                                                                                                                                                                                  |
| `next build`                    | ⚠️ **Bricht mit Standard-Heap ab** (`FATAL ERROR: Reached heap limit`, Exit 134). Mit `NODE_OPTIONS=--max-old-space-size=8192` erfolgreich (91s). **Neuer Deployment-Blocker:** Jede CI/Docker-Umgebung mit Default-Node-Heap wird ab jetzt failen. Fix: `NODE_OPTIONS` in das `build`-Script/Dockerfile aufnehmen ODER (besser) untersuchen, was den Compile-Speicher seit dieser Runde so aufbläht. |

## 2. Alle 6 Mängel der letzten Runde: behoben ✅

1. **cron-auth-Test** — rekursiv umgebaut, grün.
2. **Autopilot** — Cron verarbeitet jetzt alle 4 Trigger-Typen (`TRIGGER_SOURCES`-Tabelle),
   hat Budget-Cap (`AUTOPILOT_NIGHTLY_BUDGET_CENTS`, `reserveAutopilotBudget`), Kill-Switch
   (`DISABLE_AUTOPILOT_CRON`), Approval-Gating (`buildApprovalGatedJob` mit
   `approval_required: true` auf jeder Execution) und einen Test. Rundown hat den Abschnitt
   „🤖 Über Nacht vorbereitet". Verwaltungs-UI existiert (`dashboard/autonomous`, 273 Zeilen,
   echte Approval-Queue mit Tabs).
3. **Passive Zeiterfassung** — Opt-in ist jetzt hart durchgesetzt („No preference means off",
   `time-suggestions/route.ts:26-45`), eigene UI-Seite (242 Zeilen).
4. **Outlook-Push** — `calendar-editor.tsx:398` ruft `api/outlook/calendar/create` tatsächlich
   auf; Zwei-Wege ist jetzt real.
5. **Bank-Feed** — `fibu-bank-feed.server.ts` + API-Route + Test existieren.
6. **beA-Filing-UI** — `dashboard/bea/page.tsx` nutzt jetzt das FilingPackage-Modell mit
   Create/Approve/Cancel-Flow.

Zusätzlich echte neue Seiten mit Substanz: `fibu` (OPOS/Mahnläufe), `kanzlei-tools`,
`dictation` (161 Z., echtes CRUD), `kyc` (209 Z.), `absences` (219 Z.), `time-suggestions`
(242 Z.), `outbound-register`, `fao-tracking`, `power-of-attorney`, Analytics-Hub
(`dashboard/analytics` — diesmal als legitimer Hub, kein Duplikat der alten Route).

## 3. Kernbefund dieser Runde: „Import-Washing" in kanzlei-tools

Der Anbindungs-Sweep meldete zunächst: fast alle 17 vormals verwaisten Module haben jetzt UI.
**Bei genauem Hinsehen stimmt das nur zur Hälfte.** `src/components/legal/kanzlei-tools.tsx`
(81 Zeilen) importiert 22 Module — aber 16 davon nur, um ihren **Funktionsnamen in eine statische
Info-Karte** zu schreiben (`data-capability={capability.name}`, Titel + Beschreibung, kein
Klick-Handler, keine Funktionalität). Für **11 Module ist diese tote Karte die einzige
„UI"-Anbindung im ganzen Produkt:**

`legal-insurance` (RSV/drebis), `peer-benchmark`, `datev-direct`, `document-interviews`,
`red-team-agent`, `white-label`, `court-analytics`, `online-booking`, `bulk-cases`,
`fee-agreements`, `claim-account` (Mahnverfahren/ZV!).

Diese 11 Features sind für einen Anwalt weiterhin **nicht benutzbar** — der Zustand hat sich
gegenüber „komplett verwaist" nur optisch verbessert (Tests existieren jetzt immerhin für die
meisten). Die 6 Mini-Tools, die in kanzlei-tools echt funktionieren (GKG-Rechner,
PKH-Schnellprüfung, Gerichtssuche, Bonitäts-Einordnung, Fax-Format-Prüfung, Rubrum-Muster), sind
extrem flach: GKG-Ausgabe ist wörtlich `JSON.stringify(gkg)`, der Rubrum-Generator erzeugt ein
hartkodiertes Muster statt Akten-Daten zu verwenden. Das ist ein Werkzeug-Prototyp, keine
Feature-Auslieferung.

## 4. Erreichbarkeits-Lücken (Regel §0.8 verletzt)

Fünf neue, substanzielle Seiten sind **von keiner Navigation aus erreichbar** (kein Sidebar-,
Palette-, Hub- oder Seiten-Link — nur direkte URL):
`/dashboard/absences`, `/dashboard/dictation`, `/dashboard/kyc`, `/dashboard/time-suggestions`
und die alte `/dashboard/commentaries` (deren Hub-Link beim Recherche-Tab-Umbau verloren ging).
`/dashboard/autonomous` hängt an genau einem Button in kanzlei-tools — funktioniert, ist aber
für ein Flaggschiff-Feature zu versteckt (gehört in die Sidebar/Admin-Sektion).

## 5. Gesamtbild

| Dimension                                                         | Stand                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Kern-Workflows (Akten, Fristen, Billing, Portal, Kommunikation)   | ✅ fertig, verifiziert, e2e-getestet (44 Playwright-Specs)                       |
| Vertrauens-/KI-Schicht (Grounding, Insights, Rundown, Autopilot)  | ✅ fertig inkl. Approval-Gating und Budget-Caps                                  |
| Regulatorik Welle 1 (XRechnung/ZUGFeRD, QR-Bill, Security-Guards) | ✅ fertig, 40 Tests, UI verdrahtet                                               |
| Welle-2-Verdrängung (Posteingang, beA-Filing, Outlook)            | ✅ im Kern fertig (beA Stufe 1/Export; Stufe 2/Partneradapter offen wie geplant) |
| **11 Welle-4/5-Module**                                           | ❌ Backend + Tests da, **UI fehlt real** (nur Alibi-Karte)                       |
| **5 Seiten**                                                      | ❌ gebaut, aber unerreichbar                                                     |
| **Build**                                                         | ❌ OOM mit Default-Heap — Deployment-Blocker                                     |

## 6. Nächste logische Schritte (priorisiert)

1. **Build-OOM fixen** (sofort): `NODE_OPTIONS=--max-old-space-size=8192` ins Build-Script +
   Ursache prüfen (Verdacht: `kanzlei-tools.tsx` importiert 22 Module in EINEN Client-Chunk —
   Aufteilen/dynamic() würde Bundle UND Heap entlasten; generell Bundle-Analyse fahren).
2. **Die 5 unerreichbaren Seiten verlinken** (30 Minuten): Sidebar-/Palette-Einträge mit
   `audienceTier`, `autonomous` prominent in die Admin-Sektion.
3. **Ehrliche Triage der 11 Karten-Features:** Für jede entscheiden — (a) echte UI jetzt bauen
   (Kandidaten mit höchstem Marktwert zuerst: `claim-account`/Mahnverfahren,
   `fee-agreements`/Budget-Alerts, `document-interviews`), (b) bewusst auf Roadmap schieben und
   die Karte als „Bald verfügbar" kennzeichnen, oder (c) Modul entfernen. Der jetzige Zustand —
   Karte suggeriert Feature, Klick tut nichts — ist schlechter als beides.
4. **Kanzlei-tools-Mini-Rechner produktreif machen:** formatierte Ausgaben statt
   `JSON.stringify`, Rubrum aus echten Akten-Daten (die `generateRubrum`-Signatur kann das
   bereits), „In Akte übernehmen"-Aktion (Spec W4.3 verlangte genau das).
5. **Danach die noch nie geprüften Dimensionen** (aus plan-remaining-dimensions.md weiter
   offen): `/security-review` (jetzt, wo die Angriffsfläche stabil ist), `/design-review`/`/qa`
   für den visuellen Feinschliff, Performance mit realistischen Datenmengen (1000+ Akten),
   Barrierefreiheits-Audit, i18n-Vollsweep.
6. **Go-Live-Mechanik:** Erster echter Ship (`/ship` mit VERSION/CHANGELOG-Disziplin laut
   CLAUDE.md), `/document-release`, Staging-Deployment mit Push-Setup-Wizard (APNs/FCM-Env),
   Portal-Phase-5-Deployment.

**Einordnung:** Das Produkt ist im Kern (alles, was ein Anwalt täglich anfasst) fertig und
solide getestet. Was fehlt, ist ehrliche Fertigstellung des letzten Wellen-Schwungs — 11 Features
sind Schaufensterattrappen, 5 Seiten sind unsichtbar, und der Build braucht einen Heap-Fix. Das
ist eine Woche fokussierter Arbeit, kein Strukturproblem.

---

## Runde 2 — Nachprüfung der 6 nächsten Schritte

**Technischer Dreiklang:** `tsc` clean (Cache gelöscht), **280 Testdateien / 5031 Tests grün**,
`npm run build` erfolgreich (88s Compile) — der Heap-Fix greift.

| Schritt                                             | Status                                                               | Befund                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Build-OOM-Fix                                    | ✅                                                                   | `NODE_OPTIONS=--max-old-space-size=8192` in `package.json:19` UND `Dockerfile.web:6`. Build via npm-Script verifiziert grün.                                                                                                                                                                                                                                                                                                                                                                                     |
| 2. Unerreichbare Seiten verlinken                   | ✅                                                                   | Alle 6 (`absences`, `dictation`, `kyc`, `time-suggestions`, `commentaries`, `autonomous`) haben jetzt Nav-Einträge.                                                                                                                                                                                                                                                                                                                                                                                              |
| 3. Triage der 11 Karten-Attrappen                   | ✅ **mit „(a) echte UI" für alle gelöst**                            | `kanzlei-tools.tsx` komplett umgebaut (292 Z., keine Wildcard-Importe mehr). Alle 16 Capabilities verlinken auf eigene Seiten — **und alle 16 Ziel-Seiten existieren mit echter Funktionalität** (Stichproben: RSV-Deckungsanfrage mit generierter E-Mail + Statusliste; Peer-Benchmark mit k-Anonymitäts-Anzeige + Beitrags-Formular; Massenakten mit CSV-Vorschau + Import; claim-account 223 Z., kyc 209 Z.). Ein „Bald verfügbar"-Mechanismus existiert zusätzlich, wird aktuell von keiner Karte gebraucht. |
| 4. Mini-Rechner produktreif                         | ✅                                                                   | Formatierte EUR-Ausgabe (`fmtEUR`, strukturierte Zeilen statt `JSON.stringify`), „In Akte übernehmen" speichert als `gkg_calculation`-Page, Rubrum-Generator mit editierbaren Parteien (`RubrumParty`).                                                                                                                                                                                                                                                                                                          |
| 5. Security-/Design-Review, Performance             | ⏳ offen (wie geplant — Nutzer-getriggerte Skills bzw. eigene Runde) |
| 6. Go-Live-Mechanik (Ship, Staging, Portal-Phase-5) | ⏳ offen (wie geplant)                                               |

**Kleinere Restpunkte (nicht blockierend):**

- 6 der 12 neuen Routen ohne `error.tsx`/`loading.tsx` (document-interviews, red-team,
  court-analytics, online-booking, fee-agreements, claim-account) — §0.8 nur teilerfüllt.
- Die neuen Seiten sind hartkodiert deutsch (kein `useLang`) — §0.7-Verstoß; bei rein internen
  Werkzeugen vertretbar, sollte aber vor einem EN-Markteintritt nachgezogen werden.
- Neue Seiten in stark komprimiertem Code-Stil (Einzeiler-JSX) — funktional einwandfrei, weicht
  aber vom Codebase-Stil ab; bei der nächsten Überarbeitung normalisieren.

**Fazit Runde 2: Alle 4 umsetzbaren nächsten Schritte sind vollständig und substanziell
umgesetzt — kein Import-Washing mehr, keine Attrappen, keine unerreichbaren Seiten, Build
deployt wieder.** Damit ist der in diesem Audit beschriebene Zustand „eine Woche fokussierter
Arbeit" abgearbeitet. Offen bleiben nur die bewusst nutzer-getriggerten Schritte (5+6) und die
drei kosmetischen Restpunkte oben.
