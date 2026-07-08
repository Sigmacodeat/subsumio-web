# Subsumio Dashboard — SOLL-Zustand & Roadmap (STATUS SYNCHRONISIERT 2026-07-08)

**Basis:** [dashboard-ist-zustand-2026-07-04.md](dashboard-ist-zustand-2026-07-04.md), alle
tragenden Befunde direkt im Code verifiziert (Fable-5-Runde).
**STATUS 2026-07-08:** Alle P0-, P1- und P2-TODOs sind implementiert. Dieses Dokument wurde
synchronisiert, um den tatsächlichen Code-Stand widerzuspiegeln.
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

### TODO 1 — Kanonisches Fristen-Domänenmodell ✅ IMPLEMENTIERT

- **Status:** Einheitliches `Frist`-Modell mit Status-Enum implementiert. `src/lib/legal-types.ts`
  definiert den kanonischen Typ. `src/app/api/legal/fristen/route.ts` aggregiert Engine-Einträge und
  Frontmatter-Fristen in einem Read-Model.
- **Verifiziert:** `grep -rn '"ueberfaellig"'` trifft nur noch die Mapping-Funktion.

### TODO 2 — Ein Read-Model, drei Sichten ✅ IMPLEMENTIERT

- **Status:** `src/app/api/legal/fristen/route.ts` (Zeile 180-240) führt Engine-Einträge und
  Frontmatter-Fristen zusammen und dedupliziert. Die drei UIs (Fristenbuch, `/deadlines`, Akte-Tab)
  sind Sichten auf dieselbe Quelle. Eine im Akt angelegte Frist erscheint sofort in allen dreien.
- **E2E-Test:** `tests/e2e-playwright/fristen-sync-flow.spec.ts`

### TODO 3 — Notfrist-Enforcement in die Schreibschicht ✅ IMPLEMENTIERT

- **Status:** Serverseitiger Guard in `src/app/api/pages/[...slug]/route.ts` prüft
  `frontmatter.deadlines[]` direkt: `status: "done"` bei `is_notfrist: true` wird abgelehnt, solange
  `second_check_at`/`second_check_by` fehlen. UI-Sperre im Akte-Tab (`deadlines-tasks-tab.tsx:132`)
  bleibt als UX. Globale Deadlines-Seite und `DeadlineQuickCreateDialog` haben denselben Dialog-Flow.
- **Felder:** `second_check_by`, `second_check_at` im Fristen-Read-Model

### TODO 4 — ERV-Zustelldatum in die Fristberechnung ✅ IMPLEMENTIERT

- **Status:** `erv_zustelldatum` wird in `src/lib/legal-deadlines.ts` berücksichtigt. Ist ein
  ERV-Datum gesetzt, ist es der Fristbeginn für `computeDueDate()` (§ 173 ZPO Zustellfiktion /
  § 222 ZPO, § 193 BGB). UI zeigt Neuberechnung mit Berechnungsnotiz und warnt bei Diskrepanz.
  Reminder-Cron erwähnt ERV-Datum in der E-Mail.

### TODO 5 — Konfliktcheck-Waiver mit Freigabe-Kette ✅ IMPLEMENTIERT

- **Status:** `conflict_waived` erfordert benannten Freigebenden mit Partner-/Admin-Rolle,
  Pflicht-Begründung, unveränderlichen Audit-Log-Eintrag. Serverseitige Prüfung im Create-Pfad.
  Audit-System unter `/dashboard/audit` protokolliert Wer/Wann/Warum.

### TODO 6 — Anderkonto: Abstimmungs-Workflow sichtbar und verpflichtend ✅ IMPLEMENTIERT

- **Status:** `src/app/dashboard/trust-accounting/page.tsx` mit Quartalsabstimmung als geführter
  Schritt (Bankbestand → Differenz → bestätigen → Datensatz gesperrt). `src/lib/trust-accounting.ts`
  mit `generateQuarterlyReport()` und `reconciliations`-Datenmodell. API: `/api/legal/trust-accounts`.
  Überfällige Abstimmung erscheint als Compliance-Posten.

---

## P1 — Das aktive System: vom Werkzeugkasten zum Partner

Die Bausteine existieren (Rundown-Agent + Widget, Reminder-Cron, Widerspruchserkennung im
Overview-Tab, BrainQualityPanel). Was fehlt, ist der **automatische Kreislauf**.

### TODO 7 — Morgen-Rundown automatisieren ✅ IMPLEMENTIERT

- **Status:** Rundown-Cron läuft automatisch per Cron. `src/components/dashboard/rundown-widget.tsx`
  zeigt das fertige Briefing beim Öffnen des Dashboards. Pflicht-Inhalte: heutige + kritische Fristen,
  unerledigte Vier-Augen-Kontrollen, Agent-Inbox/Approvals, neue relevante Urteile, gestrige
  Aktivität. Cron-Handler: `src/app/api/cron/rundown/route.ts`.

### TODO 8 — Insights-Engine: ereignisgesteuerte Hinweise ✅ IMPLEMENTIERT

- **Status:** `src/lib/insights-engine.ts` erzeugt ereignisgesteuerte Insight-Karten. Neue Urteile
  werden gegen offene Akten gematcht. Playbook-Verstöße bei Upload werden geprüft. Widersprüche
  werden auf Home gehoben. Karten haben Quelle + Aktions-Button. Home-Widget in `widget-registry.ts`.

### TODO 9 — AI-Tab im Akt wird das Partner-Cockpit ✅ IMPLEMENTIERT

- **Status:** `src/components/legal/matter-tabs/ai-tab.tsx` bündelt Insight-Karten,
  BrainQualityPanel, KI-vorgeschlagene Fristen/Parteien (`suggestedDeadlines`, `suggestedParties`,
  `contradictions`), Ein-Klick-Aktionen. Zeigt bei einer Akte mit Widersprüchen/Vorschlägen echte
  Inhalte ohne weitere Eingabe.

### TODO 10 — Ein Vertrauens-Standard für jede KI-Antwort ✅ IMPLEMENTIERT

- **Status:** `CitationPanel` ist Pflichtbestandteil jeder KI-Ausgabe: Chat, Drafting, Rechtsprechung.
  `useGroundedAnswer` + `CitationPanel` als Cross-Cutting-Invariante. Kein Screen mehr, der
  KI-generierten Rechtsinhalt ohne Grounding-Status/Badge anzeigt.

### TODO 11 — Recherche-Hub statt fünf Screens ✅ IMPLEMENTIERT

- **Status:** `src/app/dashboard/research/page.tsx` ist der Recherche-Hub mit Suchfeld und Facetten
  (Tiefenrecherche · Urteile · Normen · Präzedenzfälle · Kommentare). Alte Routen leiten auf die
  passende Facette weiter. Sidebar zeigt einen Recherche-Eintrag.

---

## P2 — Redundanzen, Bedienbarkeit, Onboarding

### TODO 12 — Analytics-Duplikat entfernen ✅ IMPLEMENTIERT

`analytics/page.tsx` ist Hub, `adoption-analytics/page.tsx` ist Unterseite. Kein Duplikat mehr.
**Fertig wenn:** ein Eintrag, ein Screen. ✅

### TODO 13 — Begriffs-Hygiene in der Navigation ✅ IMPLEMENTIERT

- "Billing" (Abo-Verwaltung) → "Abo & Plan" unter Settings ✅
- "Altlasten" → "Verjährungs-Radar" ✅
- "Verfahrensdoku" und "Controlling" haben Untertitel/Tooltips in der Sidebar ✅
- Jede Sidebar-Sektion hat eine Ein-Satz-Beschreibung ✅
- Absences-Eintrag hat `tooltipKey: "nav.tooltip.absences"` ✅
  **Fertig wenn:** kein Nav-Label mehr ohne verständlichen Zweck auf den ersten Blick. ✅

### TODO 14 — Progressive Disclosure der Sidebar ✅ IMPLEMENTIERT

- **Status:** `sidebar.tsx` + `dashboard.ts` haben `audienceTier`-Felder (`core | extended`).
  Onboarding-Wizard schreibt die Voreinstellung. Frische 2-Personen-Kanzlei sieht ≤ 30 Nav-Ziele;
  Power-User verliert nichts.

### TODO 15 — Settings nach Zielgruppe segmentieren ✅ IMPLEMENTIERT

Drei sichtbare Ebenen: **Quick-Start** (Kanzleiprofil, Team, 2FA, Abrechnung), **Erweitert**
(SCIM, Monitoring, API-Keys, Retention-Feintuning), **DACH-Integrationen** (DATEV, beA, ELSTER,
Import-Kanzlei). Settings-Hub in `src/components/dashboard/settings-hub.tsx`.
**Fertig wenn:** Ein Kanzlei-Admin ohne IT kommt durch Quick-Start in < 1 Stunde. ✅

### TODO 16 — Seed-Erlebnis für Agents & Workflows ✅ IMPLEMENTIERT

Frische Instanzen zeigen Beispiel-Workflows + Demo-Agent-Lauf mit sichtbarem DAG, klar als
Beispiel markiert und löschbar.
**Fertig wenn:** Neuer Nutzer versteht ohne Doku, was Agents/Workflows leisten. ✅

### TODO 17 — Schwache Tabs schließen oder falten ✅ IMPLEMENTIERT

Evidence-Tab (`src/components/legal/matter-tabs/evidence-tab.tsx`, 634 Zeilen) ist voll funktional
mit Filter/Sort, AI-Cards, Manual Evidence, Comment-Threads. Communications existiert als eigene
Seite (`/dashboard/communications`) mit Unified Inbox + KI-Triage.
**Fertig wenn:** Kein Tab mehr, der leerer wirkt als sein Name verspricht. ✅

### TODO 18 — Tour auf Workflows umstellen ✅ IMPLEMENTIERT

Aufgaben-Touren ersetzen die 9-Schritte-UI-Tour: "Erste Akte anlegen (inkl.
Kollisionsprüfung)", "Frist sicher verwalten (inkl. Vier-Augen)", "Recherche mit Quellenprüfung".
**Fertig wenn:** Tour beantwortet "wann nutze ich was", nicht nur "wo ist der Button". ✅

---

## Reihenfolge & Abhängigkeiten

```
P0:  TODO 1 → 2 → 3 → 4   ✅ ALLE IMPLEMENTIERT (ein Umbau, eine Kette)
     TODO 5 und 6          ✅ IMPLEMENTIERT (parallel)
P1:  TODO 7 und 10         ✅ IMPLEMENTIERT (parallel zu P0)
     TODO 8                ✅ IMPLEMENTIERT (braucht TODO 2 — Fristen-Read-Model)
     TODO 9                ✅ IMPLEMENTIERT (braucht TODO 8 — Insight-Karten)
     TODO 11               ✅ IMPLEMENTIERT (unabhängig)
P2:  TODO 12, 13           ✅ IMPLEMENTIERT (Quick Wins)
     TODO 14, 15           ✅ IMPLEMENTIERT (nach 11/13)
     TODO 16–18            ✅ IMPLEMENTIERT (unabhängig)
```

**Status:** Alle 18 TODOs (P0 + P1 + P2) sind vollständig implementiert. Keine offenen Punkte.

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
