# Subsumio Dashboard — IST-Zustand-Audit (2026-07-04)

**Scope:** Vollständiger Scan von `src/app/dashboard/**` (~150 Routen), `src/components/dashboard/**`,
`src/components/legal/**` inkl. aller `matter-tabs`, `src/content/dashboard.ts`.
**Methode:** 4 parallele Codebase-Scans (Navigation/IA, Kern-Workflow, KI/Superbrain, Settings/Compliance),
Modell: Sonnet (Kostengründe, siehe Vorgabe). Detailanalyse/Priorisierung folgt in Runde 2 mit Fable 5.
**Zweck:** Rohbefund, KEINE Bewertung "gut/schlecht" der Prioritäten — das kommt im nächsten Schritt.

> **Korrekturen nach Code-Verifikation (Runde 2, Fable 5):** Drei Sub-Agent-Befunde wurden bei der
> Nachprüfung im Code korrigiert:
>
> 1. `commentaries` **existiert** (Seite + API-Routen) — der Befund "toter Link" war falsch.
> 2. Die Notfrist-Zweitkontrolle **wird im Akte-Tab-Formular erzwungen** (Statuswechsel auf
>    "erledigt" öffnet den Vier-Augen-Dialog statt zu speichern, `deadlines-tasks-tab.tsx:132`).
>    Die Lücke ist präziser: Die Sperre lebt **nur in dieser einen UI**, nicht in der Schreibschicht —
>    globale Deadlines-Seite, QuickCreate-Dialog und API können daran vorbeischreiben.
> 3. Das Dashboard-Home ist **nicht leer**: Es gibt eine Widget-Registry mit 13 Widgets
>    (`src/lib/widget-registry.ts`), darunter Rundown (KI-Tagesbriefing), Heute-Panel, Deadlines,
>    Inbox, Review-Gaps, AI-Activity. Die Lücke ist präziser: Das Rundown muss **manuell getriggert**
>    werden, und es gibt keine ereignisgesteuerten Insights (neue Rechtsprechung ↔ eigene Akten,
>    Playbook-Verstöße) — die Bausteine existieren, der proaktive Kreislauf fehlt.
>    Alle übrigen Kernbefunde (3 Fristen-Enums, ERV-Datum nicht in Berechnung, Analytics-Duplikat)
>    wurden im Code **bestätigt**.

---

## 0. Executive Summary

Subsumio ist **kein Mockup**. Es ist ein technisch reifes, extrem breites Legal-SaaS mit echten
API-Integrationen, echtem CRUD, echter KI-Pipeline (Supervisor-Agents, Grounding, Workflows) und
DACH-spezifischer Tiefe (BRAO, DATEV, beA, ELSTER, GoBD, DSGVO, RVG). Das ist die gute Nachricht.

Die schlechte Nachricht: Das Produkt ist an mehreren Stellen **breiter als tief** — es wurden
Features nebeneinander gebaut statt eine Konzeptfamilie konsequent vereinheitlicht. Das erzeugt drei
Klassen von Problemen:

1. **Ein sicherheitskritischer Bruch:** Das Fristensystem existiert **dreifach parallel**
   (Fristenbuch / `/deadlines` / Fristen-Tab im Akt) mit **drei verschiedenen Status-Enums**, die
   nicht ineinander konvertiert werden. Das ist der gravierendste Einzelbefund des gesamten Audits,
   weil eine verpasste Frist für eine Kanzlei ein Haftungsfall ist.
2. **Funktions-Wildwuchs bei der KI/Rechercheebene:** 4–5 Screens tun im Kern dasselbe
   ("Gesetz/Rechtsprechung nachschlagen"), ohne dass die Unterschiede in der UI erklärt werden.
   Ein Link im Produkt zeigt sogar auf eine Route, die es gar nicht gibt (`commentaries`).
3. **Admin-Fläche mit 46+ Settings-Routen** — für eine 5–30-Anwalts-Kanzlei ist das eine
   Enterprise-Oberfläche (Salesforce-Ausmaß), obwohl der Zielkunde eher "Kanzleipartner mit
   Nachmittag Zeit" ist als eine IT-Abteilung.

Der KI-"Superbrain"-Anspruch ("digitaler Kanzleipartner") ist **aktuell nicht eingelöst**: Die KI ist
im gesamten Produkt **rein reaktiv** (User muss jeden Screen aktiv anstoßen). Es gibt **keinen**
proaktiven Hinweis auf dem Dashboard-Home ("3 Fristen morgen kritisch", "neue Rechtsprechung zu
Ihrem Fall X", "Vertragsklausel Y widerspricht Ihrem Playbook"). Genau das wäre der Hebel, um sich
von Harvey/Clio abzusetzen — aktuell ist Subsumio in der Erlebnisqualität eher "Werkzeugkasten mit
Chatbot" als "Partner, der mitdenkt".

---

## 1. Navigation & Informationsarchitektur

**Quelle:** `src/components/dashboard/sidebar.tsx`, `src/content/dashboard.ts`, Topbar,
Command-Palette, Mobile-Tab-Bar, Guided Tour.

### 1.1 Struktur (3 Ebenen)

- **Tier 1 – immer sichtbar (5 Items):** Overview, Cases, Deadlines, Intake, Research
  (Tax-Variante: Overview, Contacts, Tax Deadlines, Intake, Chat)
- **Tier 2 – 9 einklappbare Sektionen, 44 Items gesamt:**

| Sektion                 | # Items | Beispiele                                                                                            |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| Clients & Communication | 5       | Contacts, Opponents, Kollisionsprüfung, Client Portal, Document Requests                             |
| Schedule & Tasks        | 4       | Calendar, Deadlines, **Fristenbuch**, Tasks                                                          |
| Documents & Drafting    | 7       | Vault, Upload, Drafting, Templates, Version History, Word-Addin, Review-Sets                         |
| Contracts               | 5       | Contracts, Clause Library, Signature, Obligation Tracking, Playbooks                                 |
| Knowledge & Research    | 3       | Brain, Graph, Sources                                                                                |
| Litigation & Court      | 6       | Litigation, Process Strategy, Litigation Analytics, Portfolio Insights, Case Scanner, Tabular Review |
| Billing                 | 6       | Invoicing, Time Tracking, Cost Calculator, DATEV-Export, Trust Accounting, Controlling               |
| Firm Operations         | 7       | Reports, Analytics, Adoption Analytics, Workflows, Approvals, Shared Spaces, Monitoring              |
| Compliance              | 6       | Compliance, Retention, Anonymize, Verfahrensdoku, Data Export, Review Queue                          |

- **Tier 3 – Admin (4 Bottom-Items + 15 versteckte Admin-Items = 19):**
  Settings, Team, Audit Log, Directory + Billing/Agents/Connectors/API-Keys/Kanzlei-Settings/
  Security/SCIM/AI-Model/Import-Kanzlei/Mobile/Onboarding/Experience/RAG-Eval/Chat-Analytics/
  Chat-Compare/WhatsApp-Templates/Calendar-Export/Judgements-Sync/Judgements-DB

**Gesamt: ~68 Nav-Items** in der Legal-Variante (Tax-Variante strukturell identisch, andere Labels).

### 1.2 Befund: Gruppierung ist gedanklich richtig, Menge ist das Problem

Die Sektionierung folgt tatsächlich Aufgaben ("Wann ist was fällig?" → Schedule; "Wie rechne ich ab?"
→ Billing) statt technischen Kategorien — das ist strukturell sauberer als ein Flat-List-Nightmare.
**Aber:** 9 Sektionen + Admin ist für einen Erstnutzer trotzdem eine Wand. Die Lösung im Produkt ist
die Command-Palette (`Cmd+K`, ~100 durchsuchbare Items) — die ist gut gebaut, aber sie ist ein
**Pflaster auf einer überladenen Navigation**, kein Ersatz für Vereinfachung. Ohne Onboarding, das
aktiv "Cmd+K" lehrt, verlässt sich ein neuer Nutzer nie darauf.

### 1.3 Redundanz-Kandidaten in der Navigation (bewusst getrennt, aber nicht erklärt)

- **Deadlines vs. Fristenbuch vs. Obligation Tracking vs. Tax Deadlines** — inhaltlich
  unterschiedliche Konzepte (siehe Abschnitt 2, dort liegt der eigentliche Systembruch), aber der
  Nutzer bekommt in der Sidebar **keinen Hinweis**, wofür welches Tool ist.
- **Research vs. Brain vs. Sources vs. Graph** — legitime Schichten (extern/intern/Meta-Config/
  Beziehungsgraph), aber ebenfalls ohne erklärenden Text.
- **Billing (Admin, Abo-Verwaltung) vs. Invoicing (Mandant abrechnen)** — Namensgebung lädt zur
  Verwechslung ein.
- **Analytics vs. Adoption-Analytics** — laut Scan **identischer Backend-Call**
  (`/api/analytics/adoption`), zwei Routen für dieselbe Sache.

### 1.4 Dashboard-Home: neutral, kein Daily Driver

`src/app/dashboard/page.tsx` zeigt Begrüßung, Brain-Connection-Status, Suchfeld, Widget-Board,
zuletzt gestellte Fragen. Es fehlt: "3 Fristen morgen kritisch", "5 ungelesene Kommentare in Akte X",
"12 neue Seiten indexiert". Ein Anwalt landet hier und navigiert sofort weiter zu Cases/Deadlines —
die Startseite trägt aktuell nichts zur täglichen Arbeit bei.

### 1.5 Mobile & Onboarding

- **Mobile-Tab-Bar:** ernstzunehmend, keine Notlösung (4 Primary-Tabs + FAB + "More"-Sheet mit
  komplettem Nav-Grid).
- **Guided Tour:** 9 Schritte, deckt UI-Elemente ab (Sidebar, Suche, Copilot, Quick-Create), erklärt
  aber **keine Workflows** (z. B. wann Fristenbuch statt Deadlines nutzen) — oberflächlich.
- Keine Hinweise/Stub-Marker (`comingSoon`-Flag existiert im Code, wird aber aktuell nirgends
  gesetzt) — die Navigation zeigt also nur fertige Routen, keine "Coming Soon"-Karten.

---

## 2. Kern-Workflow: Akte, Fristen, Kalender, Abrechnung

**Quelle:** `cases/*`, `matter-tabs/*`, `fristenbuch/*`, `deadlines/*`, `trust-accounting/*`,
`kollisionspruefung/*`, `legal-types.ts`, `matter-detail-types.ts`, `fristen-kette-e2e.test.ts`.

### 2.1 Akten (Cases/Matters) — real und ordentlich gebaut

- **Case-Liste:** echte API (`api.brain.listPages({type:"legal_case"})`), berechnet offene Fristen,
  kritische Fristen (≤3 Tage), offene Aufgaben, Zeiterfassungssumme — kein Mock.
- **Intake (3-Schritt-Wizard):** Pflichtfelder, KI-gestützte Partei-Vorschläge, Fuzzy-Matching
  bestehender Kontakte, eingebauter Konfliktcheck vor dem Speichern, Mehrfach-Gegner-Support,
  verknüpfte Akten (Klammer-Mandate), Offline-Fallback.
- **Aktendetail — 10 Tabs** (Overview, Documents, Deadlines/Tasks, Strategy, Activity + im
  "More"-Dropdown: Evidence, Billing, Communications, Contacts, AI): fast alle mit echten Daten,
  Overview-Tab ist mit ~1.250 Zeilen der umfangreichste (Parteien, Sachverhalt, Ansprüche,
  Gegendarstellungen, Widersprüche, KI-Vorschläge, Checklisten, verknüpfte Akten).
- Schwächere Tabs: **Evidence** (weitgehend Platzhalterfelder), **AI-Tab** (nur 147 Zeilen, wirkt wie
  Stub für spätere Erweiterung), **Communications** (Compose/Send vorhanden, aber keine Ansicht
  bereits geführter Kommunikation).

### 2.2 Fristensystem — der kritischste Einzelbefund des gesamten Audits

Es existieren **drei getrennte Fristen-UIs mit drei unterschiedlichen Status-Enums**, die nicht
zueinander konvertiert werden:

| System                                             | Quelle                                                            | Status-Werte                                               |
| -------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| **Fristenbuch** (`/dashboard/fristenbuch`)         | Proxy zu externem Engine-Backend, deterministische Klassifikation | `ok / vorfrist / kritisch / ueberfaellig`                  |
| **Deadlines-Seite** (`/dashboard/deadlines`)       | liest `frontmatter.deadlines[]` der Akten-Seiten                  | `pending / warning / critical / overdue / done / vorfrist` |
| **Fristen-Tab im Akt** (`deadlines-tasks-tab.tsx`) | dieselbe Frontmatter, aber lokal editierbar                       | `pending / warning / critical / overdue / done`            |

Zusätzlich nutzt das Datenmodell `DeadlineEntry` parallel die Felder `date` **und** `due_date`
(beide optional, an unterschiedlichen Stellen im Code verwendet) — das wird im Code defensiv per
Fallback-Kette abgefangen, ist aber ein Symptom für ein nie konsolidiertes Datenmodell.

**Konkrete Konsequenz für den Kanzleialltag:** Legt ein Anwalt eine Frist im Akte-Tab an, taucht sie
**nicht automatisch** im globalen `/deadlines` oder im Fristenbuch auf. Es gibt keinen erzwungenen
Sync. Eine Kanzlei muss faktisch an drei Stellen nachsehen, um sicher zu sein, nichts übersehen zu
haben — das ist bei einem Produkt, dessen zentrales Sicherheitsversprechen "keine verpasste Frist"
sein müsste, der größte Widerspruch im gesamten Dashboard.

**Weitere Lücken im selben Bereich:**

- **Vier-Augen-Prinzip (Notfrist-Kontrolle):** Felder (`is_notfrist`, `second_check_required`,
  `second_check_by`, `second_check_at`) existieren im Datenmodell und im Formular, **aber die UI
  verhindert nicht**, dass eine Notfrist auf "erledigt" gesetzt wird, ohne dass die
  Zweitkontrolle stattgefunden hat (`deadlines-tasks-tab.tsx`, Statuswechsel-Logik).
- **ERV-Zustelldatum** (§193 BGB / §222 ZPO, elektronische Zustellung) wird als Feld gespeichert,
  aber **nicht** in der Fristberechnung (`legal-deadlines.ts`, `computeDueDate()`) berücksichtigt.
- Der einzige vorhandene E2E-Test (`fristen-kette-e2e.test.ts`) prüft nur die Pipeline→Frontmatter→
  Digest-Kette, **nicht** das Fristenbuch selbst — die Systeme sind also auch testseitig getrennt.

### 2.3 Kollisionsprüfung (§43a BRAO) — real, aber ohne Nachweis-Kette

Client-seitiges Fuzzy-Matching (Levenshtein + Tokenvergleich, Schwellenwerte für exakte/ähnliche
Treffer), serverseitige Zweitprüfung beim Anlegen einer Akte, dedizierte Seite
`/dashboard/kollisionspruefung`. Funktioniert. **Lücke:** Ein "Waiver" (Verzicht auf Konflikteinrede)
wird als Freitext + Zeitstempel gespeichert — es gibt **keine** Pflicht zur Partner-Freigabe, keinen
Upload eines unterschriebenen Verzichts, keine Eskalation/Audit-Trail-Pflicht.

### 2.4 Fremdgeldverwaltung / Anderkonto (§51a BRAO) — CRUD vorhanden, Abstimmung fehlt

Konten anlegen, Transaktionen (Einzahlung/Auszahlung/Transfer/Gebühr/Zins/Korrektur), Saldenberechnung
— alles real. Eine Funktion für Quartalsberichte existiert im Code
(`generateQuarterlyReport()`), wird aber in der UI **nicht sichtbar aufgerufen/erzwungen**. Kein
sichtbarer Abstimmungs-Workflow (Bankbeleg vs. Buchbestand bestätigen), keine Sperr-/Freigabelogik
für "Sperrkonto"-Fälle.

### 2.5 Abrechnung/Zeiterfassung/Invoicing — solide

Timer, abrechenbare Flags, Auslagen, automatische Rechnungsgenerierung aus Zeiteinträgen/Auslagen,
Statuskette (Entwurf → Versendet → Bezahlt → Überfällig). Kein Befund von Stub-Charakter.

---

## 3. KI / "Superbrain"-Ebene

**Quelle:** Chat, Research, Precedent-Search, Rechtsprechung, Norms, Drafting, Analyze, Case-Scanner,
Playbooks, Templates, Clause-Library, Tabular-Review, Review-Queue/-Sets, Agents, Workflows,
CitationPanel, BrainQualityPanel.

### 3.1 Substanz: kein Fake, aber überall reaktiv statt proaktiv

Jede geprüfte Seite ruft echte Endpunkte auf (`/api/legal/research`, `/api/legal/analyzeDocument`,
`/api/legal/caseScan`, `/api/legal/tabularReview`, Supervisor-Agent-Jobs mit Polling, SSE-Realtime
bei Workflows). Es gibt **keine** Lorem-Ipsum-Mockups. Playbooks, Templates, Clause-Library, Review-
Sets sind vollwertiges CRUD.

**Aber:** Über die gesamte KI-Fläche hinweg gibt es **null proaktive Oberflächen**. Alles verlangt
einen Klick des Nutzers ("Start Scan", "Run Research", "Generate"). Für den Anspruch "digitaler
Kanzleipartner" fehlt genau das Gegenteil: unaufgefordert sichtbare Hinweise auf dem Dashboard oder
im Akt ("Diese Klausel widerspricht Playbook X", "3 neue Urteile zu Ihrem Fall", "Recherchelücke in
Schriftsatz Y"). Die einzige echte "Health"-Metrik (`BrainQualityPanel`, Coverage-Score der
Wissensbasis) ist vorhanden, aber nur innerhalb eines Akts sichtbar, nicht auf der Startseite.

### 3.2 Wildwuchs bei "Recht nachschlagen"

Fünf Screens beantworten im Kern dieselbe Nutzerfrage ("Was sagt das Gesetz/die Rechtsprechung dazu")
mit unterschiedlichen UIs und Datenpfaden:

| Screen           | Datenquelle                                     | Eigenart                                                                                                   |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Research         | Supervisor-Agent (mehrstufig, Budget-gesteuert) | einziger Screen mit vollständigem Grounding-Call                                                           |
| Rechtsprechung   | Brain → externe API (RIS-OGD) → **KI-Fallback** | Fallback parst KI-Freitext per Regex zu Pseudo-Urteilen — brüchig, ungeprüft                               |
| Precedent Search | eigener API-Endpunkt                            | Relevanz-Score statt geprüfter Zitate                                                                      |
| Norms            | Brain-Suche + Gesetzeskorpus                    | Statute-Lookup                                                                                             |
| Commentaries     | —                                               | **Route existiert nicht**, aber wird von `research/page.tsx` als Hub-Link verlinkt → toter Link im Produkt |

**Konsistenzproblem Zitat-Verifikation:** Das `CitationPanel` (Grounding, geprüfte/nicht geprüfte
Zitate, Attorney-Review-Badge) wird nur in Research, Analyze und Tabular-Review verwendet — **nicht**
in Chat, Drafting oder Rechtsprechung. Ein Anwalt bekommt also je nach Screen völlig unterschiedliche
Vertrauens-Signale für KI-Output, ohne dass das im Produkt erklärt wird.

### 3.3 Agents & Workflows: Architektur echt, aber ohne Beispiel-/Startdaten

DAG-Visualisierung, Job-Inbox, SSE-Realtime-Updates — technisch fundiert. Auf einer frischen Instanz
ist die Liste jedoch leer (keine Seed-Daten/Beispiel-Workflows), wodurch ein neuer Nutzer nicht sieht,
was das Feature überhaupt leistet, bevor er selbst etwas anstößt.

---

## 4. Settings / Compliance / Admin

**Quelle:** 46 Routen unter Settings, Billing, Compliance, Analytics, Integrationen, Praxismanagement.

### 4.1 Umfang

46 distincte Admin-/Settings-/Compliance-Zielrouten (Team, Security/2FA, SCIM, API-Keys, Compliance-
Checklisten für DSGVO/GwG/GoBD/AI-Act, Audit-Log, 5 Analytics-Varianten, DATEV-/Daten-Export,
Kalender-Export, E-Mail-/WhatsApp-/beA-/ELSTER-/Word-Addin-Integrationen, Vault, Versionshistorie,
Signatur, Shared Spaces, Client Portal, Import aus RA-MICRO/Advoware/DATEV, Gegner-Datenbank,
Verjährungs-Scanner ("Altlasten"), Expertise-Matrix, Verfahrensdoku, Kostenrechner,
Prozessstrategie, Mobile-Konfiguration — Details siehe Sub-Report).

Fast alles davon ist laut Scan **real** (nur 2 von 46 wirken wie Beta/unfertig: Monitoring-Engine,
Signature). Kein Bloat aus Nichts — aber Bloat aus **zu vielen sichtbaren Zielgruppen gleichzeitig**.

### 4.2 Kernbefund: Enterprise-Tiefe ohne Segmentierung nach Kanzleigröße

Funktionen wie SCIM/WorkOS-Verzeichnis-Sync, Monitoring/Regulatory-Watch mit Keyword-Konfiguration,
Retention-Policy mit 3-Stufen-Lebenszyklus sind **objektiv sinnvoll für 20–30-Anwalts-Kanzleien mit
Compliance-Bedarf**, aber für eine 1–5-Personen-Kanzlei irrelevant und verwirrend — es gibt **keine
Vor-Konfiguration/Ausblendung nach Kanzleigröße** (kein "Quick Start" vs. "Advanced"-Split). Der
Onboarding-Wizard fragt z. B. mitten im Flow nach WhatsApp-Konfiguration, obwohl das nur ein
Bruchteil der Kanzleien nutzt.

**Namensgebung:** "Altlasten" (= Verjährungs-Scanner), "Verfahrensdoku", "Controlling" sind
Fachjargon, der ohne Tooltip/Erklärtext selbst deutschsprachigen Nutzern nicht sofort verständlich
ist — im internationalen (AT/CH-)Kontext noch mehr.

**Technischer Bruch:** Connector-Setup (Legal-Judgements, beA, ADVOKAT-Bridge) läuft laut Scan primär
über CLI-Befehle, die UI zeigt nur Status an — das widerspricht dem Anspruch "Kanzlei-Admin kann
alles im Dashboard selbst konfigurieren" und erzwingt technisches Personal für die
Ersteinrichtung.

**Duplikat bestätigt:** `analytics` und `adoption-analytics` sind zwei Routen für denselben API-Call.

---

## 5. Bruchstellen-Übersicht (technische Befunde, nicht priorisiert)

| #   | Befund                                                                                                                                                                                                      | Bereich       | Charakter                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------- |
| 1   | Fristensystem 3-fach mit inkompatiblen Status-Enums, kein Sync                                                                                                                                              | Kern-Workflow | Datenmodell/Prozessbruch                    |
| 2   | Notfrist-Zweitkontrolle nur im Akte-Tab-Formular erzwungen, nicht in der Schreibschicht (andere Write-Pfade ungeschützt)                                                                                    | Kern-Workflow | Guard-Logik an falscher Stelle              |
| 3   | ERV-Zustelldatum gespeichert, aber nicht in Fristberechnung verwendet (`legal-deadlines.ts`: 0 Treffer)                                                                                                     | Kern-Workflow | totes Feld                                  |
| 4   | ~~`commentaries`-Route fehlt~~ **korrigiert: existiert** — kein Befund                                                                                                                                      | KI-Ebene      | Fehlbefund, gestrichen                      |
| 5   | Rechtsprechung-KI-Fallback parst Freitext per Regex zu Pseudo-Urteilen ohne Validierung                                                                                                                     | KI-Ebene      | fragile Fallback-Logik                      |
| 6   | CitationPanel/Grounding inkonsistent über Chat/Drafting/Rechtsprechung hinweg                                                                                                                               | KI-Ebene      | Vertrauens-Inkonsistenz                     |
| 7   | `analytics` = `adoption-analytics` (identischer Backend-Call, zwei Routen)                                                                                                                                  | Admin         | Redundanz                                   |
| 8   | Connector-Ersteinrichtung nur per CLI, UI ist reiner Statusanzeiger                                                                                                                                         | Admin         | Bruch im "Self-Service"-Versprechen         |
| 9   | Konfliktcheck-Waiver ohne Partner-Freigabe-Pflicht/Audit-Trail                                                                                                                                              | Kern-Workflow | Compliance-Lücke                            |
| 10  | Anderkonto-Quartalsbericht-Funktion existiert, wird in UI nicht erzwungen/angezeigt                                                                                                                         | Kern-Workflow | Compliance-Lücke                            |
| 11  | Agents/Workflows ohne Seed-/Beispieldaten auf frischer Instanz                                                                                                                                              | KI-Ebene      | Onboarding-Lücke                            |
| 12  | Proaktive Bausteine (Rundown-Widget, Reminder-Cron, Widerspruchserkennung) existieren, sind aber nicht zu einem automatischen Kreislauf verbunden — Rundown nur manuell, keine ereignisgesteuerten Insights | Gesamtprodukt | Kernversprechen ("Partner") nicht eingelöst |

---

## 6. Was als Nächstes ansteht

Dies ist bewusst **nur der IST-Zustand** ohne Priorisierung/Bewertung, wie in der Aufgabenstellung
vorgesehen. Für die nächste Runde (Fable 5, Detailanalyse) bieten sich als Leitfragen an:

1. Wie wird aus den drei Fristensystemen **ein** verbindliches System (welches wird Master, wie
   migriert man bestehende Daten)?
2. Welche der ~68 Nav-Items lassen sich für den Erstkontakt ausblenden, ohne Power-User zu
   beschneiden (Progressive Disclosure statt Feature-Löschung)?
3. Wie sieht ein proaktives Dashboard-Home aus, das den "digitaler Partner"-Anspruch tatsächlich
   erlebbar macht (Deadline-Alerts, Risiko-Flags, neue Rechtsprechung, Playbook-Verstöße)?
4. Konsolidierung der Recherche-Screens (Research/Rechtsprechung/Precedent-Search/Norms/
   Commentaries) zu einer facettierten Oberfläche?
5. Segmentierung der Settings-Fläche nach Kanzleigröße/Region (Quick-Start vs. Advanced/DACH-
   spezifisch)?
