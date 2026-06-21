# Kanzlei-OS Dashboard Audit

Datum: 2026-06-21
Scope: `/dashboard`, `src/components/dashboard/*`, Dashboard-Routen, Dashboard-E2E-Tests

## Executive Decision

Ja, Subsumio sollte ein Kanzlei-OS-Dashboard bauen. Aber nicht so, wie der aktuelle erste Eindruck im Screenshot wirkt.

Das Dashboard darf nicht als "Brain Admin Console" starten. Fuer Kanzleien muss der erste Screen ein operatives Cockpit sein: Akten, Fristen, Posteingang, Aufgaben, Review-Queues, Umsatz, Risiko, Teamlast und KI-Aktionen. Das Brain ist die Infrastruktur darunter, nicht die Hauptnavigation fuer die Nutzerin.

## Befund

### P0: Erster Screen kommuniziert das falsche Produkt

`src/app/dashboard/page.tsx` baut die Startseite um Brain-Verfuegbarkeit, Upload und Query herum. Der Header ist generisch "Dashboard"; die primären CTAs sind "Dokument hinzufügen" und "Brain fragen".

Nachweis:

- `src/app/dashboard/page.tsx:16` laedt `useBrainStats()`
- `src/app/dashboard/page.tsx:37` zeigt bei Engine-Fehler einen dominanten Fehlerblock
- `src/app/dashboard/page.tsx:84` nutzt nur den generischen Titel `dashboard.title`
- `src/app/dashboard/page.tsx:95` priorisiert Upload statt Kanzlei-Arbeit
- `src/components/dashboard/widget-dashboard.tsx:49` startet mit Brain-/Getting-Started-Widgets

Auswirkung: Eine Kanzlei sieht nicht "mein Arbeitstag ist unter Kontrolle", sondern "technische Wissensdatenbank ist leer/kaputt".

### P0: Sidebar ist vorhanden, aber nicht als Kanzlei-OS kuratiert

Die Repo enthaelt 69 Dashboard-Pages, davon viele Kanzlei-Module. Die Sidebar listet sie jedoch in langen, technischen Gruppen. "Gehirn" steht vor "Akten & Fristen", Administration bleibt sehr prominent, und das sichtbare Screenshot-Erlebnis kann bei Scroll-/Viewport-/Fehlerzustand wie eine Settings-Konsole wirken.

Nachweis:

- `src/components/dashboard/sidebar.tsx:80` beginnt mit `nav.section.brain`
- `src/components/dashboard/sidebar.tsx:97` erst danach Akten und Fristen
- `src/components/dashboard/sidebar.tsx:109` sehr breite Recherche-Gruppe mit vielen Modulen
- `src/components/dashboard/sidebar.tsx:539` Administration als eigener Bottom-Block

Auswirkung: Wettbewerber mit klaren Workspaces wirken fokussierter, auch wenn Subsumio mehr Features hat.

### P0: Offline-/Engine-Fehler blockiert Produktwahrnehmung

Wenn Brain-Status nicht laedt, zeigt `/dashboard` fast nur "Engine oder Netzwerk ist nicht erreichbar". Fuer ein Kanzlei-OS darf ein Engine-Fehler nicht das gesamte Cockpit ersetzen. Akten, Fristen, Aufgaben und lokale/Backend-Daten sollten weiter sichtbar sein, mit degradierter KI-Schicht.

Nachweis:

- `src/app/dashboard/page.tsx:37-49` rendert bei Fehler nur den Error-State
- `src/components/dashboard/sidebar.tsx:365-383` zeigt weiterhin "Brain Status Active" mit 0 pages/0 entities, auch wenn die Engine faktisch nicht erreichbar ist

Auswirkung: Der Screenshot wirkt schlimmer als "leerer Zustand"; er wirkt wie ein Produkt ohne Kernnutzen.

### P1: Widgets messen Infrastruktur statt Kanzlei-Erfolg

Die Standard-KPIs sind Seiten, Entitaeten, Graph-Kanten, Queries und Gesetze. Das sind Engineering-Metriken. Eine Kanzlei erwartet: offene Akten, kritische Fristen, neue Eingänge, offene Reviews, Umsatz/Abrechnung, SLA/Risiko, Team-Auslastung.

Nachweis:

- `src/components/dashboard/widget-dashboard.tsx:131-137` definiert technische Stats
- `src/components/dashboard/widget-dashboard.tsx:49-55` setzt diese Stats als erstes Widget

Auswirkung: Das Dashboard beweist nicht, dass Subsumio die Kanzlei steuert.

### P1: Tests pruefen Rendering, nicht Produktversprechen

Die Tests sind brauchbar fuer Routing, Auth und einige Kanzlei-Flows. Es fehlt aber ein Test, der die erste Dashboard-Experience absichert: wichtigste Navigation sichtbar, keine dominante Brain-Fehlerseite, Kanzlei-KPIs im Above-the-fold-Bereich.

Nachweis:

- `tests/e2e-playwright/smoke.spec.ts:189-214` prueft "Pages render without 503"
- `tests/e2e-playwright/kanzlei-flow.spec.ts:38-122` prueft Einzelflows, nicht das Cockpit

Auswirkung: Eine Regression wie im Screenshot kann durchkommen, solange einzelne Seiten laden.

## Zielbild

Das Dashboard sollte als "Kanzlei OS" erscheinen:

1. Tagessteuerung: Heute, kritisch, wartet, delegiert.
2. Aktenzentrale: wichtigste Akten, Status, Fristen, Gegner, naechste Aktion.
3. Eingangs- und Review-Zentrale: beA, E-Mail, WhatsApp, Portal, Dokumentenanfragen, Freigaben.
4. Fristen- und Risiko-Cockpit: kritische Fristen, ungepruefte KI-Erkennungen, Eskalation.
5. Finanz-/Controlling-Schnappschuss: offene Rechnungen, abrechenbare Leistungen, DATEV-Export.
6. KI als Assistenzschicht: Recherche, Drafting, Analyse, Agenten, aber kontextuell an Akten gebunden.
7. Brain/Graph als Power-Tools, nicht als erster Navigationsanker.

## Implementierungsplan

### Phase 1: Erste Wahrnehmung reparieren

Ziel: Der Screenshot darf nie wieder wie eine kaputte Settings-Konsole aussehen.

Tasks:

- `/dashboard` zu "Kanzlei-Cockpit" umbenennen und PageHeader auf Kanzlei-Betrieb ausrichten.
- Engine-Fehler als schmalen Banner zeigen, nicht als Full-Page-Block.
- Above-the-fold mit KPI-Leiste ersetzen: kritische Fristen, offene Akten, Inbox, Reviews, Rechnungen.
- Empty State als Kanzlei-Onboarding bauen: Akte importieren, beA/E-Mail anbinden, erste Frist pruefen, Team einladen.
- Sidebar-Reihenfolge aendern: Kanzlei Cockpit, Akten, Fristen, Inbox/Intake, Dokumente, Drafting, Recherche, Abrechnung, Compliance, Team/Admin, Brain Lab.

### Phase 2: Informationsarchitektur straffen

Ziel: Weniger Module im Kopf, mehr Workflows.

Tasks:

- Sidebar in 6 feste Workspaces gliedern:
  - Cockpit
  - Akten & Mandanten
  - Eingang & Fristen
  - Dokumente & Drafting
  - Recherche & Wissen
  - Kanzlei & Verwaltung
- "Brain", "Graph", "RAG-Eval", "Sources", "AI Model", "API Keys" in einen sekundären Bereich "System / Brain Lab" verschieben.
- Feature-Duplikate pruefen: Upload/Vault/Email-Import/Document-Requests/Import-Kanzlei muessen als Dokumentenpipeline statt als Einzeltools erscheinen.
- Command Palette als Power-Zugriff behalten.

### Phase 3: Kanzlei-Datenmodell fuer Dashboard aggregieren

Ziel: Dashboard nicht aus generischen BrainStats zusammensetzen.

Tasks:

- Neues Aggregat `useKanzleiDashboard()` bzw. `/api/dashboard/kanzlei-summary`.
- Datenpunkte: openCases, criticalDeadlines, overdueDeadlines, unreviewedAiFindings, intakeItems, pendingApprovals, openInvoices, draftQueue, teamLoad.
- Graceful degradation: Wenn Brain/AI ausfaellt, bleiben Kanzlei-Daten sichtbar.
- Mock-/Fixture-Daten fuer E2E-Tests bereitstellen.

### Phase 4: Cockpit-UI bauen

Ziel: Best-of-class operatives SaaS, nicht Marketing und nicht Admin.

Layout:

- Oben: Datum, Kanzlei-Kontext, globale Suche, Quick Actions.
- KPI-Streifen: Fristen, Akten, Inbox, Reviews, Abrechnung.
- Linke Hauptspalte: "Heute zu erledigen" mit priorisierten Tasks.
- Rechte Spalte: "Kritische Fristen" und "Eingang".
- Unterer Bereich: "Aktive Akten", "KI-Vorschlaege", "Controlling".

Wichtig:

- Keine riesige Hero-Optik.
- Keine rein technischen Metriken als Hauptsignal.
- Dichte, scanbare Tabellen/Listen.
- Jede Karte braucht eine klare Aktion.

### Phase 5: Regressionstests

Ziel: Produktversprechen maschinell absichern.

Tests:

- `/dashboard` zeigt "Kanzlei-Cockpit" oder aequivalente Kanzlei-Sprache.
- Sidebar zeigt im ersten Viewport Akten/Fristen/Inbox, nicht nur Admin/Settings.
- Simulierter Brain-Fehler zeigt Banner, aber Cockpit bleibt sichtbar.
- Kritische Fristen und offene Akten sind above the fold sichtbar.
- Mobile Sidebar zeigt dieselben Kernbereiche.
- Axe/Keyboard fuer neue Cockpit-Widgets.

## Empfehlung

Wir sollten es machen. Aber als echte Produktentscheidung: Subsumio ist dann nicht "GBrain mit Legal-Skin", sondern Kanzlei-OS mit Brain-Unterbau. Der technische Brain-Layer bleibt Differenzierung, darf aber nicht die erste Nutzerwahrnehmung dominieren.

Naechster sinnvoller Schritt: Phase 1 direkt implementieren und die bestehenden Audit-Dokumente nicht als "produktionsreif" behandeln, bis ein visuelles Playwright-Screenshot-Audit das neue Cockpit bestaetigt.
