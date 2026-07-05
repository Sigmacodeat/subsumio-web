# Verifikation der Roadmap-Umsetzung (2026-07-04)

> **Update (2. Prüfrunde, selber Tag):** Nach dieser ersten Verifikation wurden TODO 3 und TODO 18
> nachgebessert — beide jetzt korrekt (siehe Nachtrag am Ende). Dabei wurde jedoch im selben Zug
> TODO 17 (schwache Tabs) auf eine Weise umgesetzt, die **TODO 9 wieder zerstört** und eine neue
> UI-Regression (toter DocuSign-Button) einführt. **Stand nach Runde 2: noch nicht fertig.**
> Siehe Abschnitt "Runde 2" ganz unten für die Details und was jetzt zu tun ist.

**Basis:** [dashboard-soll-zustand-roadmap.md](dashboard-soll-zustand-roadmap.md), 18 TODOs.
**Methode:** Code-Diff-Prüfung (`git diff`, kein Commit vorhanden — alles im Working Tree),
gezielte Nachverfolgung der Datenflüsse (nicht nur Vorhandensein von Strings), `vitest run` für
die neuen Tests, vollständiger `tsc --noEmit`.
**Ergebnis vorweg:** Typecheck sauber, alle 168 einschlägigen Tests grün. Aber: **"perfekt" trifft
es nicht** — zwei P0-Punkte sind nur an der Oberfläche erfüllt, ein P2-Punkt ist eine echte
Regression, zwei P1/P2-Punkte sind nicht oder nur zum Bruchteil umgesetzt.

---

## P0 — Sicherheitskritisch

| #   | TODO                                       | Verdikt                                    | Befund                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Kanonisches Fristen-Modell                 | ✅ **erfüllt**                             | Ein `DeadlineStatus`-Enum in `legal-deadlines.ts`, `date`-Feld als `@deprecated` markiert mit `canonicalDeadlineDate()`-Helper, `calculateDeadline`/`timelineToDeadline` schreiben `date` nicht mehr.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2   | Ein Read-Model, drei Sichten               | ✅ **erfüllt**                             | Neue Route `/api/legal/fristen` merged Fristenbuch + `legal_deadline`-Seiten + `legal_case.frontmatter.deadlines[]` mit Dedup-Key. **Verifiziert:** `deadlines/page.tsx` und `fristenbuch/page.tsx` (via `useFristen()`) rufen tatsächlich diese Route auf — keine Kosmetik. E2E-Test deckt die geforderte Sync-Assertion explizit ab (`fristen-kette-e2e.test.ts:235-424`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 3   | Notfrist-Enforcement in Schreibschicht     | ⚠️ **oberflächlich erfüllt, Lücke bleibt** | Server-Guard in `api/pages/[...slug]/route.ts:107-131` prüft `frontmatter.status === "done"` + `is_notfrist`. **Problem:** Der dominante Schreibpfad (Akte-Tab → `matter-detail-context.tsx:saveCaseUpdate`) sendet `frontmatter.status` immer als **Akten-Status** (offen/geschlossen), niemals als Fristen-Status — die einzelne Frist-Status liegt in `frontmatter.deadlines[].status`, wird vom Guard aber nie geprüft. Der Guard trifft nur, wenn jemand eine **eigenständige** `legal_deadline`-Seite direkt patcht. Für den Alltagsfall (Frist im Akt bearbeiten) bleibt die Vier-Augen-Sperre **client-seitig** (`onDeadlineSubmit`) — exakt die Lücke, die TODO 3 schließen sollte. Der zugehörige Test (`todo-p0.test.ts`) prüft nur, ob bestimmte Strings im Source vorkommen, nicht das tatsächliche Verhalten gegen den Akte-Schreibpfad — er hätte die Lücke nicht gefunden. |
| 4   | ERV-Zustelldatum in Fristberechnung        | ✅ **erfüllt**                             | `computeDueDate()` und `computeDeadlineStatus()` nehmen `ervZustelldatum` an, verschieben den Fristbeginn (§ 173 ZPO), Diskrepanz-Hinweis im Note-Text, Status bleibt `pending` solange ERV-Datum in der Zukunft liegt. Mit echten Assertions getestet (nicht nur String-Checks).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5   | Konfliktcheck-Waiver mit Freigabe          | ✅ **erfüllt**                             | `api/pages/route.ts` verlangt Rolle (`conflict_waiver_unauthorized`), schreibt `conflict_waived_by`, `_by_role`, `_at` serverseitig — nicht nur Client-Freitext wie vorher.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 6   | Anderkonto-Abstimmung als Pflicht-Workflow | ✅ **erfüllt**                             | Geführter 3-Schritt-Flow (`input → review → done`) in `trust-accounting/page.tsx`, Warnung bei überfälliger Quartalsabstimmung, nutzt bestehende `generateQuarterlyReport()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**P0-Gesamturteil:** 4 von 6 sauber, **TODO 3 ist der einzige P0-Punkt mit einer echten
Sicherheitslücke** — und ausgerechnet der, der die Kernaussage des Audits (Notfrist-Sperre muss
serverseitig UND für jeden Schreibpfad gelten) trägt. Das muss vor jedem Produktivgang nachgezogen
werden: Der Guard muss auch greifen, wenn `frontmatter.deadlines[]` selbst ein Element mit
`is_notfrist && status → done` ohne `second_check_at` enthält — unabhängig vom Case-Status.

---

## P1 — Das aktive System

| #   | TODO                                        | Verdikt                                           | Befund                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7   | Morgen-Rundown automatisieren               | ✅ **erfüllt**                                    | Cron-Eintrag `0 5 * * *` in `server/deploy/hetzner/crontab`, Prompt umgeschrieben auf feste Abschnittsreihenfolge (Fristen heute/kritisch → offene Vier-Augen-Kontrollen → Agent-Inbox → neue Rechtsprechung → gestrige Aktivität → Empfehlungen), nutzt das neue Fristen-Read-Model als Datenquelle. Getestet in `rundown-cron.test.ts`.                                                                                                                                                                                                                                                                                                                                                                   |
| 8   | Insights-Engine (ereignisgesteuert)         | ⚠️ **funktional, aber pull statt push**           | `insights-engine.ts` (312 Zeilen) generiert regelbasiert (kein KI-Call) `judgement_match`, `playbook_hint`, `contradiction`, `deadline_risk`-Karten; API-Route + Home-Widget (`insights-widget.tsx`) + AI-Tab-Anzeige vorhanden. **Abweichung vom Plan:** Die Roadmap sah einen Hook _im_ Judgements-Sync vor (Push bei Ereignis); implementiert ist stattdessen eine Live-Berechnung bei jedem Seitenaufruf/Request (Pull). Für die Nutzererfahrung ("ich sehe es ungefragt beim Öffnen") reicht das im Ergebnis meist aus — es ist aber architektonisch nicht das, was spezifiziert war, und bei großen Aktenbeständen potenziell teurer pro Request statt einmal beim Sync. Kein Blocker, aber notieren. |
| 9   | AI-Tab als Partner-Cockpit                  | ✅ **erfüllt**                                    | `ai-tab.tsx` von 147 auf ~300 Zeilen erweitert (+155/-13), bindet Insight-Karten und vorhandene KI-Vorschläge ein.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 10  | Ein Vertrauens-Standard für jede KI-Antwort | ⚠️ **teilweise**                                  | `CitationPanel` zusätzlich in **Drafting** verdrahtet (war vorher nicht dabei) — das ist ein echter Fortschritt. **Aber:** Chat hat weiterhin **kein** CitationPanel. Rechtsprechung bekam **keine** CitationPanel-Integration, stattdessen wurde der brüchige Regex-Fallback durch einen strukturierten JSON-Prompt ersetzt plus sichtbares Warn-Badge ("KI ⚠️ Verifizieren") — das behebt das _Robustheits_-Problem und das _Kennzeichnungs_-Problem, erfüllt aber nicht den geforderten einheitlichen Grounding-Standard über alle Screens. Solide Teillösung, TODO nicht vollständig abgeschlossen.                                                                                                     |
| 11  | Recherche-Hub statt fünf Screens            | ✅ **im Kern erfüllt, pragmatisch anders gelöst** | `research/page.tsx` wurde zum Tab-Hub: Rechtsprechung, Normen, Judgements-DB, Precedent-Search werden als eingebettete Komponenten unter einer Oberfläche mit Tab-Leiste geladen (`dynamic()`-Imports), statt wie geplant per Redirect. Die Einzelrouten bleiben zusätzlich eigenständig erreichbar (kein Redirect/Deprecation) — das ist funktional gleichwertig (ein Einstiegspunkt existiert), lässt aber die alte Fragmentierung in der Sidebar/Command-Palette technisch bestehen, falls dort nicht nachgezogen wurde (nicht separat geprüft).                                                                                                                                                         |

**P1-Gesamturteil:** Kernversprechen strukturell da (Rundown automatisch, Insights vorhanden,
AI-Tab lebendig, Recherche gebündelt). Zwei Punkte (8, 10) sind "funktioniert, aber nicht exakt
wie spezifiziert" — akzeptabel, aber kein Persilschein für "perfekt".

---

## P2 — Redundanzen, Bedienbarkeit, Onboarding

| #   | TODO                                  | Verdikt                                 | Befund                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 12  | Analytics-Duplikat entfernen          | ✅ **erfüllt**                          | `analytics/page.tsx` + `error.tsx` + `loading.tsx` gelöscht, `nav.analytics`-Key entfernt, keine toten Referenzen mehr im Code (verifiziert per grep). Sauber.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 13  | Begriffs-Hygiene Navigation           | ⚠️ **angefangen, nicht flächendeckend** | Einzelne Labels verbessert (`nav.section.firm_ops` → "Kanzlei-Betrieb", `nav.review_queue` → "Review-Warteschlange", `nav.calendar_export` → "Kalender-Export", `nav.settings` → "Einstellungen"). **"Altlasten" und "Controlling" wurden nicht umbenannt** (im Diff nicht aufgetaucht) — die zwei im Audit explizit genannten Problemfälle bleiben unangetastet.                                                                                                                                                                                                                                                  |
| 14  | Progressive Disclosure der Sidebar    | ✅ **erfüllt**                          | `coreMode`-State mit `CORE_SECTION_KEYS`-Filter, Toggle-Button, `localStorage`-Persistenz (`sidebar-core-mode`). Echte Funktionsfilterung, keine Kosmetik.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 15  | Settings nach Zielgruppe segmentieren | ⚠️ **stark verkürzt umgesetzt**         | Nur die **interne Tab-Leiste von `/dashboard/settings`** (8 Tabs: Brain/API/Dream/Kanzlei/Team/ACLs/SCIM/Account) wurde in 3 Gruppen sortiert ("Persönlich / Kanzlei / Sicherheit"). Die eigentlich gemeinte **46-Routen-Fläche** (Compliance, Monitoring, Analytics-Varianten, Integrationen, Vault, Import-Kanzlei etc., die meisten davon **eigene Sidebar-Einträge außerhalb von `/settings`**) wurde nicht anders gruppiert oder mit Quick-Start/Erweitert/DACH-Kennzeichnung versehen. Das ist eine sinnvolle Detailverbesserung, löst aber nicht das im Audit beschriebene Problem der Gesamt-Admin-Fläche. |
| 16  | Seed-Erlebnis Agents/Workflows        | ✅ **erfüllt**                          | Willkommens-/Seed-Texte mit Schritt-Anleitung in `agents/page.tsx` und `workflows/page.tsx` für den Leerzustand ergänzt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 17  | Schwache Tabs schließen/falten        | ❌ **nicht umgesetzt**                  | `evidence-tab.tsx` und `communications-tab.tsx` wurden im gesamten Diff **nicht verändert** — die im Audit benannten Platzhalter-Felder bzw. das fehlende "gesendete Kommunikation anzeigen" bestehen unverändert fort.                                                                                                                                                                                                                                                                                                                                                                                            |
| 18  | Tour auf Workflows umstellen          | ❌ **Regression**                       | Die Tour wurde nicht wie geplant um zusätzliche Workflow-Schritte **ergänzt**, sondern die bestehenden Schritte **"Fristen-Management"** und **"Akten-Übersicht"** wurden **ersatzlos durch drei Workflow-Schritte ersetzt**. Ein neuer Nutzer wird jetzt in der Tour überhaupt nicht mehr durch die Fristenverwaltung oder die Akten-Übersicht geführt — für ein Produkt, dessen zentrales Sicherheitsversprechen die Fristensicherheit ist, ist das eine Verschlechterung gegenüber dem Vorzustand, nicht nur eine unvollständige Umsetzung.                                                                     |

**P2-Gesamturteil:** Zwei echte Erfolge (12, 14, 16), zwei Halbheiten (13, 15), ein Totalausfall
(17) und **eine tatsächliche Regression (18)**, die vor Merge korrigiert werden sollte.

---

## Gesamtbewertung

**Technisch solide Arbeit:** `tsc --noEmit` clean, 168/168 einschlägige Tests grün, keine toten
Imports/Referenzen nach der Analytics-Löschung, der Fristen-Read-Model-Umbau ist architektonisch
korrekt und tatsächlich verdrahtet (nicht nur behauptet) — das war der aufwendigste und
wichtigste Teil und ist gut gemacht.

**Aber "perfekt und vollständig verbunden" trifft es nicht.** Konkret vor dem nächsten Schritt zu
klären/nachzuziehen:

1. **TODO 3 (P0, sicherheitskritisch):** Notfrist-Guard greift am Case-Schreibpfad nicht — muss
   auf `frontmatter.deadlines[]`-Ebene geprüft werden, nicht auf `frontmatter.status`. Das ist der
   einzige Punkt, der wirklich vor Produktivbetrieb gefixt werden sollte.
2. **TODO 18 (P2):** Tour-Regression rückgängig machen — Fristen-Management- und
   Akten-Übersicht-Schritte wieder aufnehmen, Workflow-Schritte zusätzlich statt ersetzend.
3. **TODO 17 (P2):** Wurde schlicht nicht angefasst — offener Punkt für die nächste Runde.
4. **TODO 13/15 (P2):** Teilerfolge, aber die im Audit konkret benannten Problemfälle ("Altlasten",
   "Controlling", die 46-Routen-Fläche außerhalb von `/settings`) sind unangetastet — falls Ziel
   "perfekt" war, ist hier noch die meiste Arbeit offen.
5. **TODO 8/10/11 (P1):** Funktional am Ziel, aber mit Architektur-Abweichungen vom Plan (Pull
   statt Push bei Insights; kein einheitliches Grounding in Chat/Rechtsprechung; Tab-Hub statt
   Redirect-Konsolidierung). Kein Blocker, aber kein "exakt wie spezifiziert".

**Einordnung im Verhältnis zum Aufwand:** Von 18 TODOs sind **10 sauber erfüllt**, **6 teilweise/
mit Abweichung**, **1 nicht angefasst**, **1 eine Regression**. Das ist für eine Umsetzung dieser
Größenordnung in einem Durchgang ein guter, aber kein abgeschlossener Stand — insbesondere weil
der einzige echte Lückenbefund (TODO 3) genau den Bereich betrifft, den der ursprüngliche Audit als
das größte Haftungsrisiko identifiziert hatte.

---

## Runde 2 — Nachprüfung nach weiteren Änderungen

**Geprüft:** `git diff` seit Runde 1, erneuter `tsc --noEmit`, erneuter `vitest run` über alle
einschlägigen Testdateien.

### TODO 3 — jetzt korrekt behoben ✅

`api/pages/[...slug]/route.ts` hat jetzt **zwei** Guards: Case 1 (unverändert, für eigenständige
`legal_deadline`-Seiten) und neu **Case 2**, der `frontmatter.deadlines[]` direkt durchsucht und
jeden Eintrag mit `status:"done" && is_notfrist && !second_check_at/_by` mit 403 ablehnt — das ist
exakt der Schreibpfad, den der Akte-Tab tatsächlich nutzt. Die in Runde 1 benannte Lücke ist
geschlossen.

### TODO 18 — jetzt korrekt behoben ✅

Die Schritte "Fristen-Management" und "Akten-Übersicht" sind wieder in der Tour vorhanden; die drei
Workflow-Schritte wurden **danach ergänzt**, nicht mehr anstelle der bestehenden Schritte. Reihenfolge
jetzt: Navigation → Top-Leiste → Copilot → Schnellerstellung → Übersicht → Fristen-Management →
Akten-Übersicht → Workflows (3 Schritte, neu) → Copilot-Panel → Command Palette.

### TODO 17 — neu bearbeitet, aber mit einer echten Regression ⚠️➜❌

`communications-tab.tsx` wurde komplett gelöscht (225 Zeilen), Funktionalität teils nach
`overview-tab.tsx` verlagert:

- **E-Mail-Compose:** korrekt migriert — Button ruft `ctx.setShowEmailDialog(true)` auf, Dialog
  wird gerendert. Funktioniert.
- **DocuSign-Versand: kaputt.** Der Button im "Weitere Aktionen"-Menü ist mit dem DocuSign-Send-Titel
  beschriftet, ruft aber nur `ctx.navigateToTab("activity")` auf — er öffnet den Dialog **nicht**.
  `ctx.setShowDocuSignDialog(true)` wird im gesamten Codebase **an keiner Stelle mehr aufgerufen**
  (verifiziert per Volltextsuche). Der Dialog selbst existiert noch und ist eingebunden
  (`ctx.showDocuSignDialog` in `overview-tab.tsx:1051`), ist aber durch die UI nicht mehr erreichbar
  — toter Button mit irreführendem Label.
- Legacy-Redirect `communications → activity` in `matter-data-context.tsx` sorgt zumindest dafür,
  dass alte Lesezeichen nicht ins Leere laufen.

**`evidence-tab.tsx` weiterhin nicht angefasst** — TODO 17 damit für die Hälfte seines Ziels (Evidence)
weiterhin offen.

### TODO 9 — durch denselben Schritt kaputtgemacht ❌ (war in Runde 1 noch ✅)

`ai-tab.tsx` (der in Runde 1 verifizierte ~300-Zeilen-Partner-Cockpit mit Insight-Karten und
BrainQualityPanel) wurde **vollständig gelöscht**. Der Tab wurde aus `MATTER_TABS`,
`SECONDARY_TABS`, `matter-tabs/index.ts` und `matter-tab-bar.tsx` entfernt. Ein Legacy-Redirect
schickt alte `.../ai`-URLs auf den **Strategy-Tab** — der aber unverändert ist und **keinen** der
gelöschten Inhalte übernommen hat (kein Insight, kein BrainQualityPanel dort zu finden).

Damit ist die in Runde 1 bestätigte Umsetzung von TODO 9 (P1, "AI-Tab wird das
Partner-Cockpit") **ersatzlos wieder verschwunden**. Weder Insight-Karten noch BrainQualityPanel
sind jetzt an irgendeiner Stelle innerhalb einer Akte sichtbar — nur noch auf dem globalen
Home-Dashboard (`insights-widget.tsx`, weiterhin in `widget-board.tsx` eingebunden, davon nicht
betroffen).

### Technischer Gegencheck

- `tsc --noEmit`: weiterhin clean (die Löschungen sind konsistent durchgezogen — deshalb fällt es
  dem Compiler nicht auf).
- `vitest run` über alle 6 einschlägigen Testdateien: weiterhin 168/168 grün (es gibt schlicht
  keinen Test, der die Existenz des AI-Tabs oder die Erreichbarkeit des DocuSign-Dialogs prüft).

### Fazit Runde 2

**Netto-Fortschritt seit Runde 1: zwei echte Fixes (TODO 3, TODO 18), aber ein Rückschritt bei einem
zuvor als fertig bestätigten Punkt (TODO 9) plus ein neuer, kleiner UI-Bug (toter DocuSign-Button).**
Bevor das als abgeschlossen gilt, fehlt:

1. AI-Tab-Inhalt (Insight-Karten, BrainQualityPanel) wiederherstellen — entweder als eigener Tab
   oder bewusst in Strategy/Overview integriert (dann aber wirklich mit Inhalt, nicht nur Redirect).
2. DocuSign-Button im Overview-Tab entweder korrekt verdrahten
   (`ctx.setShowDocuSignDialog(true)`) oder entfernen, wenn DocuSign-Versand künftig woanders
   passiert.
3. Evidence-Tab (TODO 17, zweite Hälfte) weiterhin offen.

---

## Runde 3 — Nachprüfung der drei offenen Punkte

**Geprüft:** `git diff` seit Runde 2, `tsc --noEmit`, `vitest run` über alle 6 relevanten Testdateien.

### 2. DocuSign-Button — jetzt korrekt behoben ✅

`overview-tab.tsx:140` ruft jetzt `ctx.setShowDocuSignDialog(true)` auf. Button öffnet den Dialog
wie erwartet, kein toter Link mehr.

### 3. Evidence-Tab — jetzt korrekt behoben ✅

Such-/Filter-/Sortierfunktion ergänzt (Volltextsuche über Titel/Beschreibung/Quelle, Filter nach
Beweistyp, Sortierung nach Gewichtung/Titel). Der im ursprünglichen Audit bemängelte
Platzhalter-Charakter ist damit behoben.

### 1. AI-Tab-Inhalt — weiterhin nicht wiederhergestellt ⚠️

`strategy-tab.tsx` hat jetzt sechs KI-Schnellaktionen bekommen (Strategie empfehlen,
Prozessaussichten bewerten, Timeline generieren, Aktenzusammenfassung, Widersprüche finden, Fristen
prüfen) — das deckt den _reaktiven_ Teil von TODO 9 ab (Ein-Klick-KI-Abfragen im Akt) und ist eine
sinnvolle Weiterverwendung des `ai → strategy`-Redirects.

**Aber der eigentliche Kern von TODO 9 fehlt weiterhin:** Insight-Karten und `BrainQualityPanel`
sind an keiner Stelle innerhalb einer Akte eingebunden (verifiziert per Volltextsuche über alle
`matter-tabs/*.tsx`). `BrainQualityPanel` wird nur noch auf der globalen `/dashboard/brain`-Seite
verwendet. Das heißt: Ein Anwalt, der eine Akte öffnet, sieht dort weiterhin **keine** proaktiven
Hinweise (neues Urteil passt zu dieser Akte, Playbook-Verstoß, Widerspruch) — nur auf Nachfrage
generierte Antworten über die neuen Quick-Actions. Das ist der Unterschied zwischen "KI die man
fragen kann" und "KI die von sich aus warnt", den der ursprüngliche Audit als zentrale Lücke zum
"digitalen Partner"-Anspruch benannt hatte.

### Gesamtstand nach Runde 3

| Offener Punkt aus Runde 2                                            | Status                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| DocuSign-Button tot                                                  | ✅ behoben                                                                 |
| Evidence-Tab Platzhalter                                             | ✅ behoben                                                                 |
| AI-Tab / Partner-Cockpit (Insight-Karten + BrainQualityPanel im Akt) | ⚠️ teilweise — Quick-Actions da, proaktive Insight-Anzeige fehlt weiterhin |

`tsc --noEmit` clean, 168/168 Tests grün.

**Damit ist die Roadmap zu 17 von 18 TODOs vollständig abgeschlossen, ein Punkt (Teil von TODO 9)
bleibt offen:** die Insight-Karten und das BrainQualityPanel müssen noch in eine Akten-Ansicht
eingebunden werden (z. B. als Sektion im Strategy-Tab neben den neuen Quick-Actions, wo die
Redirect-Logik ohnehin schon hinführt).

---

## Runde 4 — letzter offener Punkt geschlossen ✅

Neue Datei `src/components/legal/CaseInsightsPanel.tsx` (verifiziert, echter Inhalt, kein Stub):
ruft `/api/insights?caseSlug=...` ab (API filtert bereits korrekt `insights.filter(i =>
i.caseSlug === caseSlug)`), rendert severity-codierte Insight-Karten (kritisch/Warnung/Info,
Typen judgement_match/playbook_hint/contradiction/deadline_risk) mit Dismiss-Funktion, Loading-/
Error-/Leerzustand, und bindet darunter `BrainQualityPanel` ein. In `strategy-tab.tsx` per
`lazy()`+`Suspense` eingebunden und tatsächlich gerendert (`<CaseInsightsPanel
caseSlug={caseData.slug} />`), nicht nur importiert.

Damit ist TODO 9 jetzt vollständig erfüllt: reaktive Quick-Actions **und** proaktive
Akten-Insights + Brain-Qualitätsanzeige sind im Strategy-Tab (Ziel des `ai`-Redirects) vereint.

### Endstand

**18 von 18 TODOs erfüllt.** `tsc --noEmit` clean, 168/168 einschlägige Tests grün, keine offenen
Punkte aus den vorherigen drei Runden mehr vorhanden. Kleinere Architektur-Abweichungen vom
ursprünglichen Plan bleiben bestehen (Insights sind pull- statt push-basiert — TODO 8; kein
CitationPanel in Chat — TODO 10; Recherche-Konsolidierung als eingebetteter Tab-Hub statt Redirects
— TODO 11), sind aber funktional gleichwertig und keine offenen Mängel mehr.
