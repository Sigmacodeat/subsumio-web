# Subsumio Dashboard — SOLL-Zustand & Roadmap (2026-07-04)

**Basis:** [dashboard-ist-zustand-2026-07-04.md](dashboard-ist-zustand-2026-07-04.md), alle
tragenden Befunde direkt im Code verifiziert (Fable-5-Runde).
**Zielbild in einem Satz:** Ein Gehirn, **eine Fristenwahrheit**, ein Partner, der morgens vor dem
Anwalt im Büro war — statt drei Fristensystemen, fünf Recherche-Screens und einer KI, die auf Klicks
wartet.

Drei Leitprinzipien für alles Folgende:

1. **Eine Wahrheit pro Konzept.** Jedes Fachkonzept (Frist, Recherche, Zitat-Vertrauen) hat genau
   ein Datenmodell und eine API. UIs sind Sichten darauf, nie eigene Datenpfade.
2. **Sicherheitsregeln leben in der Schreibschicht, nie in einer UI.** Alles, was Haftung berührt
   (Notfrist, Waiver, Anderkonto), wird serverseitig erzwungen; die UI zeigt es nur schön an.
3. **Proaktiv heißt: ohne Klick.** Der "digitale Partner" entsteht nicht durch mehr Features,
   sondern dadurch, dass vorhandene Erkenntnisse (Fristen, Widersprüche, neue Urteile) den Anwalt
   von selbst erreichen — auf dem Home, im Akt, per Mail.

---

## P0 — Sicherheitskritisch: Die eine Fristenwahrheit

Das Fristensystem ist der Haftungskern des Produkts und aktuell dreigeteilt. Alles in P0 gehört in
**einen** zusammenhängenden Umbau (ein Branch, eine Migration), nicht in Einzelfixes.

### TODO 1 — Kanonisches Fristen-Domänenmodell

- **Was:** Ein einziger `Frist`-Typ als Quelle der Wahrheit. Ein Status-Enum
  (`pending | vorfrist | warning | critical | overdue | done`), das Fristenbuch-Vokabular
  (`ok/vorfrist/kritisch/ueberfaellig`) wird zur reinen **Anzeige-Ableitung** (Mapping-Funktion, kein
  zweites Enum). `due_date` wird das einzige Datumsfeld; `date` wird per Migration übernommen und aus
  dem Typ entfernt (aktuell koexistieren beide optional in `src/lib/legal-types.ts:7` und werden per
  Fallback-Kette `due_date || date` abgefangen — das ist das Symptom).
- **Wo:** `src/lib/legal-types.ts`, `src/lib/matter-detail-types.ts`,
  `src/app/dashboard/deadlines/page.tsx:65`, `src/app/dashboard/fristenbuch/page.tsx:43`,
  Migrationsskript für bestehende Frontmatter.
- **Fertig wenn:** Es gibt genau eine Status-Enum-Definition im Codebase, `grep -rn '"ueberfaellig"'`
  trifft nur noch die Mapping-Funktion, und kein Code liest mehr `deadline.date`.

### TODO 2 — Ein Read-Model, drei Sichten

- **Was:** Eine API (`/api/legal/fristen`), die Engine-Einträge (Fristenbuch-Klassifikation) und
  Frontmatter-Fristen **zusammenführt und dedupliziert**. Die drei bestehenden UIs bleiben, werden
  aber zu Sichten auf dieselbe Quelle: Fristenbuch = revisionssichere Audit-Sicht (chronologisch,
  read-only), `/deadlines` = Arbeits-Sicht (heute/kritisch, Kalkulator, Quick-Entry), Akte-Tab =
  Akten-Sicht (CRUD im Kontext). Eine im Akt angelegte Frist erscheint **sofort** in allen dreien.
- **Wo:** Neue Route unter `src/app/api/legal/fristen/`, Umbau der drei Konsumenten, Proxy-Logik aus
  `src/app/api/legal/fristenbuch/route.ts` einbeziehen.
- **Fertig wenn:** E2E-Test: Frist im Akte-Tab anlegen → erscheint in `/deadlines` und im
  Fristenbuch ohne manuellen Sync. Der bestehende Test `fristen-kette-e2e.test.ts` wird um genau
  diese Assertion erweitert (er testet heute nur Pipeline→Frontmatter→Digest, nicht das Fristenbuch).

### TODO 3 — Notfrist-Enforcement in die Schreibschicht

- **Was:** Serverseitiger Guard: `status: "done"` bei `is_notfrist: true` wird **abgelehnt**, solange
  `second_check_at`/`second_check_by` fehlen — egal welcher Client schreibt. Die bestehende UI-Sperre
  im Akte-Tab (`deadlines-tasks-tab.tsx:132`, funktioniert dort korrekt) bleibt als UX, ist aber
  nicht mehr die einzige Verteidigungslinie. Globale Deadlines-Seite und
  `DeadlineQuickCreateDialog.tsx` bekommen denselben Dialog-Flow.
- **Wo:** Zentrale Validierung an der Stelle, wo Fristen persistiert werden (Frontmatter-Write-Pfad
  in `matter-detail-context.tsx` + API-Schicht), plus die zwei ungeschützten UIs.
- **Fertig wenn:** Ein direkter API-Write "Notfrist → done ohne Zweitkontrolle" schlägt mit klarem
  Fehler fehl (Unit-Test), und jede UI kann den Vier-Augen-Dialog auslösen.

### TODO 4 — ERV-Zustelldatum in die Fristberechnung

- **Was:** `erv_zustelldatum` wird heute gespeichert, angezeigt und in Reminder-Mails erwähnt, aber
  `legal-deadlines.ts` kennt es nicht (0 Treffer). Neu: Ist ein ERV-Datum gesetzt, ist es der
  Fristbeginn für `computeDueDate()` (§ 173 ZPO Zustellfiktion / § 222 ZPO, § 193 BGB); die UI zeigt
  die Neuberechnung mit Berechnungsnotiz und warnt, wenn ERV-Datum und manuell gesetztes `due_date`
  auseinanderfallen.
- **Wo:** `src/lib/legal-deadlines.ts` (`computeDueDate`, `calculateDeadline`),
  Frist-Formulare (Akte-Tab, QuickCreate, `/deadlines`-Kalkulator).
- **Fertig wenn:** Unit-Tests: ERV-Datum gesetzt → Fristende korrekt ab Zustelldatum inkl.
  Wochenend-/Feiertagsverschiebung; Diskrepanz-Warnung erscheint im Formular.

### TODO 5 — Konfliktcheck-Waiver mit Freigabe-Kette

- **Was:** `conflict_waived` erfordert künftig: benannten Freigebenden mit Partner-/Admin-Rolle,
  Pflicht-Begründung, unveränderlichen Audit-Log-Eintrag. Optionaler Dokumenten-Anhang
  (Verzichtserklärung). Ohne Freigabe bleibt die Akte in `conflict_pending` und wird im Dashboard
  als offener Posten angezeigt.
- **Wo:** `src/app/dashboard/cases/new/page.tsx:276` (Waiver-Persistenz), serverseitige Prüfung im
  Create-Pfad, Audit-Log-Anbindung (Audit-System existiert bereits unter `/dashboard/audit`).
- **Fertig wenn:** Waiver ohne berechtigte Rolle wird serverseitig abgelehnt; Audit-Log zeigt Wer/
  Wann/Warum.

### TODO 6 — Anderkonto: Abstimmungs-Workflow sichtbar und verpflichtend

- **Was:** Der bereits existierende `generateQuarterlyReport()` und das `reconciliations`-Datenmodell
  bekommen eine UI: Quartalsabstimmung als geführter Schritt (Bankbestand eingeben → Differenz
  anzeigen → bestätigen → Datensatz gesperrt). Überfällige Abstimmung erscheint als Compliance-Posten
  auf Home/Compliance-Seite.
- **Wo:** `src/app/dashboard/trust-accounting/page.tsx`, `src/lib/trust-accounting.ts` (Logik da,
  UI fehlt).
- **Fertig wenn:** Abgeschlossene Abstimmung ist unveränderlich; fällige Abstimmung erzeugt einen
  sichtbaren Hinweis.

---

## P1 — Das aktive System: vom Werkzeugkasten zum Partner

Die Bausteine existieren (Rundown-Agent + Widget, Reminder-Cron, Widerspruchserkennung im
Overview-Tab, BrainQualityPanel). Was fehlt, ist der **automatische Kreislauf**.

### TODO 7 — Morgen-Rundown automatisieren

- **Was:** Das Rundown (KI-Tagesbriefing, existiert als Agent-Job + Home-Widget mit manuellem
  Trigger, `src/components/dashboard/rundown-widget.tsx`) läuft künftig **automatisch per Cron**
  vor Arbeitsbeginn. Pflicht-Inhalte mit fester Reihenfolge: (1) heutige + kritische Fristen aus dem
  neuen Fristen-Read-Model, (2) unerledigte Vier-Augen-Kontrollen, (3) Agent-Inbox/Approvals,
  (4) neue relevante Urteile (TODO 8), (5) gestrige Aktivität. Wer morgens das Dashboard öffnet,
  sieht das fertige Briefing — kein Klick.
- **Wo:** Neuer Cron-Handler (Muster: `src/app/api/cron/deadline-reminders/route.ts`,
  `server/deploy/hetzner/crontab`), Rundown-Prompt/Job-Definition, Widget unverändert.
- **Fertig wenn:** Frische Instanz mit einer Akte + einer Frist zeigt am nächsten Morgen ein
  ungefragtes Briefing mit dieser Frist.

### TODO 8 — Insights-Engine: ereignisgesteuerte Hinweise

- **Was:** Ein Insight-Erzeuger, der auf Ereignisse reagiert statt auf Klicks — als eigener
  Seitentyp (z. B. `insight`-Pages im Brain), gerendert als Karten auf Home und im Akt:
  - **Neues Urteil ↔ offene Akte:** Beim Judgements-Sync jedes neue Urteil per Brain-Suche gegen
    offene Akten (Rechtsgebiet + Kernbegriffe) matchen → "Neues BGH-Urteil könnte Akte X betreffen".
  - **Playbook-Verstoß bei Upload:** Nach Dokument-Extraktion Klauseln gegen aktive Playbook-Regeln
    prüfen → Karte im Akt.
  - **Widersprüche aufs Home heben:** Die Contradiction-Erkennung existiert im Overview-Tab —
    ungelöste Widersprüche zusätzlich als Home-Karte.
    Jede Karte: ein Satz, Quelle, ein Aktions-Button (Akte öffnen / Recherche starten / verwerfen).
- **Wo:** Hook in Judgements-Sync + Dokument-Pipeline (Engine-Seite `server/`), neues Home-Widget
  in `src/lib/widget-registry.ts` + `widget-dashboard.tsx`, Akten-Anzeige im AI-Tab (TODO 9).
- **Fertig wenn:** Judgements-Sync mit passendem Testurteil erzeugt ohne Nutzeraktion eine
  Insight-Karte, die auf die richtige Akte verlinkt.

### TODO 9 — AI-Tab im Akt wird das Partner-Cockpit

- **Was:** Der heutige Mini-AI-Tab (147 Zeilen, wirkt wie Stub) bündelt alles Proaktive zum Akt:
  Insight-Karten (TODO 8), BrainQualityPanel (existiert, ist heute versteckt), KI-vorgeschlagene
  Fristen/Parteien (existieren im Datenmodell: `suggestedDeadlines`, `suggestedParties`,
  `contradictions`), plus Ein-Klick-Aktionen (Strategie aktualisieren, Recherche zu offener Frage).
- **Wo:** `src/components/legal/matter-tabs/ai-tab.tsx`, Daten aus `matter-detail-context`.
- **Fertig wenn:** Der AI-Tab zeigt bei einer Akte mit Widersprüchen/Vorschlägen echte Inhalte ohne
  weitere Eingabe.

### TODO 10 — Ein Vertrauens-Standard für jede KI-Antwort

- **Was:** Das `CitationPanel` (Grounding, verifizierte/unverifizierte Zitate,
  Attorney-Review-Badge) wird **Pflichtbestandteil jeder KI-Ausgabe**: Chat, Drafting und
  Rechtsprechung ziehen nach (heute nur Research, Analyze, Tabular-Review). Der Rechtsprechungs-
  KI-Fallback (Regex-Parsing von Freitext zu Pseudo-Urteilen, `rechtsprechung/page.tsx:88ff`) wird
  ersetzt: strukturierte Ausgabe mit Pflicht-Grounding — was nicht verifizierbar ist, wird sichtbar
  als "KI-Hypothese, kein belegtes Urteil" markiert oder gar nicht gelistet.
- **Wo:** `CitationPanel.tsx` (wiederverwenden), `chat/page.tsx`, `drafting/page.tsx`,
  `rechtsprechung/page.tsx`, Grounding-Call `api.legal.ground()` als gemeinsamer Schritt.
- **Fertig wenn:** Es gibt keinen Screen mehr, der KI-generierten Rechtsinhalt ohne
  Grounding-Status/Badge anzeigt.

### TODO 11 — Recherche-Hub statt fünf Screens

- **Was:** Research, Rechtsprechung, Precedent-Search, Norms und Commentaries werden **eine** Route
  (`/dashboard/research`) mit einem Suchfeld und Facetten (Tiefenrecherche · Urteile · Normen ·
  Präzedenzfälle · Kommentare). Die Engine kann das (ein Query, facettierte Ergebnisse); die fünf
  Backends bleiben, werden aber hinter einer Oberfläche gebündelt. Alte Routen → Redirects, damit
  Bookmarks/Command-Palette nicht brechen.
- **Wo:** `src/app/dashboard/research/page.tsx` als Hub ausbauen, vier Redirect-Routen,
  Sidebar/Command-Palette-Einträge in `src/content/dashboard.ts` konsolidieren.
- **Fertig wenn:** Sidebar zeigt einen Recherche-Eintrag; jede alte URL leitet auf die passende
  Facette; kein Funktionsverlust (alle fünf Backends erreichbar).

---

## P2 — Redundanzen, Bedienbarkeit, Onboarding

### TODO 12 — Analytics-Duplikat entfernen

`analytics/page.tsx:78` und `adoption-analytics/page.tsx:136` rufen identisch
`/api/analytics/adoption` auf. Eine Route löschen, Redirect setzen, Nav-Eintrag entfernen.
**Fertig wenn:** ein Eintrag, ein Screen.

### TODO 13 — Begriffs-Hygiene in der Navigation

- "Billing" (Abo-Verwaltung) → "Abo & Plan" unter Settings, damit es nicht mit "Invoicing"
  (Mandanten-Abrechnung) kollidiert.
- "Altlasten" → "Verjährungs-Radar" (o. ä.), "Verfahrensdoku" und "Controlling" bekommen
  Untertitel/Tooltips in der Sidebar.
- Jede Sidebar-Sektion erhält eine Ein-Satz-Beschreibung (erklärt u. a. Fristenbuch vs. Fristen,
  Brain vs. Research).
  **Wo:** `src/content/dashboard.ts`. **Fertig wenn:** kein Nav-Label mehr ohne verständlichen Zweck
  auf den ersten Blick.

### TODO 14 — Progressive Disclosure der Sidebar

- **Was:** Zwei Modi: **Start-Set** (~25 Items: Akten, Fristen, Kalender, Recherche-Hub, Dokumente,
  Abrechnung, Kontakte, Kollisionsprüfung, Settings-Basis) und **Vollansicht**. Steuerung über
  Onboarding (Kanzleigröße, Rechtsgebiete, genutzte Integrationen) + manueller Schalter "Alle
  Funktionen anzeigen". Nichts wird gelöscht — nur der Erstkontakt wird atembar.
- **Wo:** `sidebar.tsx` + `dashboard.ts` (Items bekommen `tier: "core" | "extended"`),
  Onboarding-Wizard schreibt die Voreinstellung.
- **Fertig wenn:** Frische 2-Personen-Kanzlei sieht ≤ 30 Nav-Ziele; Power-User verliert nichts.

### TODO 15 — Settings nach Zielgruppe segmentieren

Drei sichtbare Ebenen: **Quick-Start** (Kanzleiprofil, Team, 2FA, Abrechnung), **Erweitert**
(SCIM, Monitoring, API-Keys, Retention-Feintuning — mit Hinweis "nur relevant wenn ..."),
**DACH-Integrationen** (DATEV, beA, ELSTER, Import-Kanzlei). CLI-pflichtige Connectoren werden als
"technische Einrichtung" gekennzeichnet — mittelfristig UI-Setup nachrüsten oder zumindest die
CLI-Befehle copy-paste-fertig im Dashboard anzeigen.
**Fertig wenn:** Ein Kanzlei-Admin ohne IT kommt durch Quick-Start in < 1 Stunde.

### TODO 16 — Seed-Erlebnis für Agents & Workflows

Frische Instanzen zeigen heute leere Listen. Neu: 2–3 lauffähige Beispiel-Workflows
(Fristen-Extraktion aus Dokument, Due-Diligence-Mini) + ein Demo-Agent-Lauf mit sichtbarem DAG,
klar als Beispiel markiert und löschbar.
**Fertig wenn:** Neuer Nutzer versteht ohne Doku, was Agents/Workflows leisten.

### TODO 17 — Schwache Tabs schließen oder falten

Evidence-Tab (Platzhalterfelder) entweder mit der Beweismittel-Logik aus Overview/Strategie füllen
oder in den Overview-Tab falten; Communications-Tab um die Anzeige geführter Kommunikation ergänzen
(Senden existiert, Lesen fehlt) oder mit Activity zusammenlegen.
**Fertig wenn:** Kein Tab mehr, der leerer wirkt als sein Name verspricht.

### TODO 18 — Tour auf Workflows umstellen

Die 9-Schritte-UI-Tour wird durch 3 Aufgaben-Touren ersetzt: "Erste Akte anlegen (inkl.
Kollisionsprüfung)", "Frist sicher verwalten (inkl. Vier-Augen)", "Recherche mit Quellenprüfung".
Erklärt dabei die Konzeptpaare (Fristenbuch vs. Fristen, Brain vs. Research), die heute niemand
erklärt.
**Fertig wenn:** Tour beantwortet "wann nutze ich was", nicht nur "wo ist der Button".

---

## Reihenfolge & Abhängigkeiten

```
P0:  TODO 1 → 2 → 3 → 4   (eine Kette, ein Umbau; 5 und 6 parallel dazu)
P1:  TODO 7 und 10 sofort parallel zu P0 startbar
     TODO 8 braucht TODO 2 (Fristen-Read-Model) für den Fristen-Teil des Rundowns
     TODO 9 braucht TODO 8 (Insight-Karten)
     TODO 11 unabhängig, jederzeit
P2:  TODO 12, 13 sind Quick Wins (< 1 Tag) — jederzeit
     TODO 14, 15 nach 11/13 (Nav erst konsolidieren, dann ausdünnen)
     TODO 16–18 unabhängig
```

**Empfohlener erster Schritt:** P0 komplett (TODO 1–4) als ein Arbeitspaket — es ist der einzige
Bereich, in dem der IST-Zustand nicht nur unbequem, sondern für eine Kanzlei gefährlich ist. Direkt
danach TODO 7 (Rundown-Cron), weil es mit minimalem Aufwand (Cron + Prompt, Widget existiert) den
größten erlebbaren Sprung Richtung "digitaler Partner" bringt.

## Was Subsumio danach von Harvey/Clio unterscheidet

- **Clio** verwaltet; es denkt nicht mit. Nach P0+P1 hat Subsumio Clios Verwaltungskern (Akten,
  Fristen, Abrechnung, Trust) **plus** ein System, das ungefragt warnt und vorschlägt.
- **Harvey** denkt; es verwaltet nicht. Harvey kennt die Akten-, Fristen- und Abrechnungsrealität
  der Kanzlei nicht — Subsumios Insights entstehen genau aus dieser Verbindung (Urteil ↔ eigene
  Akte, Klausel ↔ eigenes Playbook, Frist ↔ eigener Kalender).
- Der verteidigbare Kern ist das Superbrain als **Verbindungsschicht**: dieselbe Wissensbasis speist
  Fristen-Radar, Recherche-Hub, Insight-Karten und das Morgen-Briefing. Deshalb ist die
  Konsolidierung (eine Wahrheit pro Konzept) keine Aufräumarbeit, sondern die Voraussetzung für das
  Differenzierungsversprechen.
