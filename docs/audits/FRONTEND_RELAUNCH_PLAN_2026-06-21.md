# Subsumio Frontend Relaunch Plan

Datum: 2026-06-21
Scope: Dashboard, Sidebar, Kanzlei-Cockpit, Navigation, visuelle Haptik

## Research Snapshot

Quellen:

- Linear beschreibt den eigenen UI-Relaunch als Reduktion visueller Unruhe, bessere Ausrichtung und höhere Navigationsdichte: https://linear.app/now/how-we-redesigned-the-linear-ui
- Attio strukturiert Workspaces um Home, Tasks, Notes, Emails, Calls, Reports, Automations, Favorites und Records statt um technische Systemmodule: https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace
- NN/g empfiehlt bei Dashboards schnelle Erfassbarkeit durch klare visuelle Hierarchie und geeignete preattentive Signale: https://www.nngroup.com/articles/dashboards-preattentive/
- NN/gs Complex-Application-Guidelines betonen Orientierung, schrittweise Offenlegung und klare Arbeitsmodelle fuer komplexe Fachsoftware: https://www.nngroup.com/articles/complex-application-design/
- Smashing Magazine fasst Dashboard-Verbesserung als Research, Decluttering und bessere Datenvisualisierung zusammen: https://www.smashingmagazine.com/2021/11/dashboard-design-research-decluttering-data-viz/

## Diagnose

Das aktuelle Dashboard ist funktional deutlich besser als vor dem Sidebar-Fix, wirkt aber noch zu generisch, weil es viele universelle SaaS-Muster zeigt: KPI-Karten, Action-Kacheln, mehrere Card-Flächen und eine KI-/Brain-Erzählung. Premium-B2B-Produkte wirken heute weniger nach "Dashboard Template" und mehr nach fachlichem Arbeitsinstrument.

Subsumio muss wie ein Kanzlei-Leitstand aussehen:

- Fristen und Akten stehen vor KI.
- Eingang und Reviews sind Arbeitsqueues, keine Feature-Kacheln.
- Abrechnung und Compliance sind Kontrollspuren.
- Brain/AI ist Infrastruktur und Assistenz, nicht die visuelle Hauptfigur.

## Designprinzipien

1. Dichte statt Dekoration
   - Weniger große Karten.
   - Mehr Listen, Zeilen, Status, Prioritaet, Verantwortlichkeit.
   - Keine ornamental wirkenden Flaechen.

2. Ein Arbeitsmodell
   - "Heute", "Fristen", "Eingang", "Aktive Akten", "Reviews", "Abrechnung".
   - Jede Ansicht muss eine naechste Aktion nahelegen.

3. Progressive Disclosure
   - Sidebar als Akkordeon mit genau einem offenen Workspace.
   - Favoriten oben, System unten.
   - Command Palette fuer Power-Navigation.

4. Vertrauenswuerdige KI
   - KI erscheint als kontrollierter Review-/Analyse-Bereich.
   - Keine AI-Magie-Labels als erster Eindruck.
   - Warnungen und Quellenstatus bleiben sachlich.

5. Ruhige visuelle Sprache
   - Kleine Radius-Werte, reduzierte Schatten, klare Linien.
   - Statusfarben nur fuer Prioritaet oder Risiko.
   - Typografie kompakt, tabellarisch und scanbar.

## Relaunch-Roadmap

### Phase 1: Navigation und Cockpit-Haptik

Status: umgesetzt.

Umgesetzt:

- Sidebar-Akkordeon, genau ein Bereich offen.
- Favoriten oben.
- Collapsed Mode ohne Text-/Icon-Duplikate.
- Kompakte KPI-Leiste statt grosser generischer Statistik-Karten.
- Quick Actions als schlanke Aktionsleiste statt Marketing-Kacheln.
- Aktive Route oeffnet automatisch den fachlich passenden Workspace.
- Manuelles Auf-/Zuklappen des offenen Workspace-Bereichs, ohne dass mehrere Bereiche gleichzeitig offen bleiben.
- Kanzlei-spezifische Markenpalette geschaerft: Navy/Ink als Grundton, Teal als Subsumio-Wiedererkennung, Gold nur fuer Prioritaet.

### Phase 2: Operative Tabellen statt Card-Sammlung

Status: gestartet.

Umsetzen:

- "Heute zu steuern" als Arbeitsqueue mit Prioritaet, Sache und naechstem Schritt. Erste Queue-Version umgesetzt.
- "Fristen" als echte Deadline-Liste mit Risiko, Datum und Status. Erste Queue-Version umgesetzt.
- "Aktive Akten" als kompakte Matter-Liste mit Rechtsgebiet und Status. Erste Queue-Version umgesetzt.
- "Eingang" als Triage-Inbox mit Kanal und Datum. Erste Queue-Version umgesetzt.
- "Sofortaktionen" als priorisierte Aktionsleiste umgesetzt: Neue Akte, Frist, Eingang, Drafting, Upload, KI.
- Naechster Ausbau: Verantwortlichkeit, SLA, Aktenzeichen, Gegner und Review-Status aus einem Dashboard-Aggregat statt aus generischen Pages ableiten.

### Phase 3: Role-Based Cockpits

Umsetzen:

- Anwalt: Fristen, Akten, Drafting, Reviews.
- Assistenz: Eingang, Fristen, Dokumentenanfragen, Kalender.
- Partner/Management: Controlling, Auslastung, offene Rechnungen, Risiko.

### Phase 4: Design-System-Haertung

Umsetzen:

- Eigene Dashboard-Density-Tokens.
- Gemeinsame ListRow-, QueueTable-, MetricRail- und WorkItem-Komponenten.
- Card-Nutzung begrenzen auf wiederholte Items oder echte Module.
- Empty States fachlich schreiben: "Keine ungeprueften Fristen" statt "Keine Daten".

### Phase 5: Visual QA und Regression

Umsetzen:

- Playwright-Screenshots Desktop/Mobile fuer `/dashboard`, `/dashboard/deadlines`, `/dashboard/cases`.
- Pixel-/Layout-Checks: keine Textueberlaeufe, keine leeren Riesenflaechen, Sidebar nur ein offener Bereich.
- Axe/Keyboard fuer Akkordeon, Command Palette und mobile Drawer.

## Naechste konkrete Schritte

1. Kanzlei-spezifische Aggregat-API fuer Dashboard-KPIs bauen, statt generische Brain-Pages mehrfach zu pollen.
2. Queue-Zeilen mit Verantwortlichkeit, SLA, Aktenzeichen, Gegner und Review-Status fuettern.
3. Visual QA lokal fixen: Auth-DB-SSL blockiert aktuell Playwright-Signup.
4. Danach branch-basierten PR-Flow statt Main-Bypass verwenden.
