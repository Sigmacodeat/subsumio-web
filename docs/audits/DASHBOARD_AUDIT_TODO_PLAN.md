# Subsumio Dashboard Frontend — Audit TODO Plan

> **Stand:** 2026-06-21 — Erste Audit-Runde (Frontend)
> **Audit-Prompt:** `docs/audits/DASHBOARD_FRONTEND_AUDIT_PROMPT.md`
> **Status:** 🔍 Audit abgeschlossen — TODOs priorisiert zur Umsetzung

---

## Zusammenfassung

| Kategorie           | P0 (Critical) | P1 (High) | P2 (Medium) | P3 (Low) | Gesamt |
| ------------------- | :-----------: | :-------: | :---------: | :------: | :----: |
| Barrierefreiheit    |       2       |     3     |      1      |    0     |   6    |
| i18n / Hardcoded DE |       1       |     4     |      0      |    0     |   5    |
| Navigation / Links  |       2       |     2     |      0      |    0     |   4    |
| UX / Konsistenz     |       0       |     3     |      2      |    0     |   5    |
| Code-Qualität       |       0       |     1     |      2      |    0     |   3    |
| **Gesamt**          |     **5**     |  **13**   |    **5**    |  **0**   | **23** |

---

## P0 — Critical (Barrierefreiheit, Broken Links, i18n-Verstöße)

### TODO-001: Sidebar Playbooks Label-Key falsch

- **Datei:** `src/components/dashboard/sidebar.tsx:103`
- **Problem:** `/dashboard/playbooks` verwendet `labelKey: "nav.vault"` statt `"nav.playbooks"`. Beide Einträge zeigen "Dokumenten-Vault" im Sidebar.
- **Fix:** `labelKey: "nav.vault"` → `labelKey: "nav.playbooks"` (Key existiert bereits in `dashboard.ts:744`)
- **Status:** ⬜ offen

### TODO-002: Command Palette fehlen 15 Sidebar-Items

- **Datei:** `src/components/dashboard/command-palette.tsx:67-413`
- **Problem:** Folgende Sidebar-Routen fehlen in der Command Palette:
  - **Recherche:** `analyze`, `precedent-search`, `translate`, `obligation-tracking`, `case-scanner`, `clause-library`, `review-queue`, `version-history`, `sources`
  - **Daten & Integration:** `intake`, `document-requests`, `word-addin`, `retention` (compliance/retention)
  - **Verwaltung:** `audit`, `ai-model` (settings/ai-model)
- **Fix:** Jeweils `CommandItem` im `COMMANDS`-Array hinzufügen mit passendem Icon, Label und Section
- **Status:** ⬜ offen

### TODO-003: Command Palette — alle Labels hardcoded DE (kein i18n)

- **Datei:** `src/components/dashboard/command-palette.tsx:67-413` + `640`, `663`, `673`, `765`, `771`, `777`, `782`
- **Problem:** Sämtliche Command-Labels, Section-Namen, UI-Strings ("Seite suchen oder Aktion ausführen…", "Keine Treffer für", "Zuletzt verwendet", "navigieren", "öffnen", "schließen", "Befehl/Befehle") sind hardcoded Deutsch. Rest des Dashboards ist bilingual via `useLang()` + `D`-Keys.
- **Fix:**
  1. `CommandItem` um `labelKey: DashboardKey` erweitern (statt `label: string`)
  2. Section-Namen als Keys definieren
  3. UI-Strings via `t()` aus `useLang()` holen
  4. Neue `D`-Keys in `dashboard.ts` hinzufügen
- **Status:** ⬜ offen

### TODO-004: Notification-Items nicht fokussierbar (WCAG 2.1.1)

- **Datei:** `src/components/dashboard/topbar.tsx:504-541`
- **Problem:** Notification-Items sind `<div>`-Elemente, nicht fokussierbar via Tab. Der "Als gelesen markieren"-Button innerhalb ist fokussierbar, aber die Notification selbst nicht als Ganzes.
- **Fix:** Notification-Item als `<button>` oder `<a>` mit `role="menuitem"` wrappen, oder zumindest `<div role="menuitem" tabIndex={0}>` verwenden
- **Status:** ⬜ offen

### TODO-005: Settings-Tabs ohne ARIA-Tablist-Semantik

- **Datei:** `src/app/dashboard/settings/page.tsx:376-395`
- **Problem:** Tab-Navigation verwendet `<button>` ohne `role="tab"`, `aria-selected`, `aria-controls`. Kein `role="tablist"` auf Container. Kein `role="tabpanel"` auf Content-Bereich. Screenreader-Nutzer können Tab-Struktur nicht erfassen.
- **Fix:**
  - Container: `role="tablist"`
  - Tab-Buttons: `role="tab"`, `aria-selected={activeTab === tab.id}`, `aria-controls={`panel-${tab.id}`}`, `id={`tab-${tab.id}`}`
  - Content-Bereich: `role="tabpanel"`, `id={`panel-${tab.id}`}`, `aria-labelledby={`tab-${tab.id}`}`
- **Status:** ⬜ offen

---

## P1 — High (UX-Inkonsistenzen, Missing Features)

### TODO-006: Widget-Dashboard hardcoded DE Strings

- **Datei:** `src/components/dashboard/widget-dashboard.tsx:57-63, 445-446, 448, 458, 469`
- **Problem:** `WIDGET_LABELS` sind hardcoded `{ de, en }` aber nicht via `D`-Keys. Edit-Mode-Strings ("Widgets anpassen", "Ansicht beenden", "Zurücksetzen", "Ausgeblendete Widgets", "Widget ausblenden") sind hardcoded DE.
- **Fix:** `D`-Keys für Widget-Labels und Edit-Mode-Strings in `dashboard.ts` definieren, via `t()` verwenden
- **Status:** ⬜ offen

### TODO-007: Topbar-Search hardcoded DE Strings

- **Datei:** `src/components/dashboard/topbar.tsx:372, 376, 411-412`
- **Problem:** "Suche…", "Keine Treffer für", "↵ für alle Ergebnisse", "Treffer" sind hardcoded DE.
- **Fix:** `D`-Keys definieren, via `t()` verwenden
- **Status:** ⬜ offen

### TODO-008: Dashboard error.tsx / loading.tsx hardcoded DE

- **Datei:** `src/app/dashboard/error.tsx:28,31` + `src/app/dashboard/loading.tsx:6`
- **Problem:** "Etwas ist schiefgelaufen", "Ein unerwarteter Fehler ist aufgetreten.", "Laden…" sind hardcoded DE. Diese Dateien sind Error-Boundaries und können `useLang()` nicht direkt verwenden (kein Client-Component-Hook-Kontext in error.tsx).
- **Fix:** Für `error.tsx`: Statische DE-Strings akzeptieren oder via `D["dashboard.error_title"].de` referenzieren. Für `loading.tsx`: Gleiches Vorgehen.
- **Status:** ⬜ offen

### TODO-009: Onboarding hardcoded DE Error-Message

- **Datei:** `src/app/dashboard/onboarding/page.tsx:120`
- **Problem:** "Onboarding konnte nicht abgeschlossen werden. Bitte erneut versuchen." ist hardcoded DE.
- **Fix:** `D`-Key definieren, via `t()` verwenden
- **Status:** ⬜ offen

### TODO-010: Deadlines Row-Click verwendet `window.open` statt `router.push`

- **Datei:** `src/app/dashboard/deadlines/page.tsx:644-645`
- **Problem:** `window.open(url, "_self")` verursacht Full-Page-Reload statt Client-Side-Navigation.
- **Fix:** `router.push(`/dashboard/cases/${encodeURIComponent(d.caseSlug)}`)` verwenden. `useRouter` ist bereits importiert in der Komponente.
- **Status:** ⬜ offen

### TODO-011: Widget-Dashboard verwendet `<a href>` statt `<Link>`

- **Datei:** `src/components/dashboard/widget-dashboard.tsx:294, 323, 364`
- **Problem:** `QuickActionsWidget`, `DreamCycleWidget`, `GettingStartedWidget` verwenden `<a href>` für interne Routes → Full-Page-Reload.
- **Fix:** `<Link href={...}>` aus `next/link` verwenden
- **Status:** ⬜ offen

### TODO-012: Topbar Search — redundanter if/else Branch (Dead Code)

- **Datei:** `src/components/dashboard/topbar.tsx:325-339`
- **Problem:** Beide Branches des if/else führen exakt denselben Code aus (`router.push(`/dashboard/brain?q=...`)`).
- **Fix:** if/else entfernen, nur den `router.push`-Call belassen
- **Status:** ⬜ offen

### TODO-013: Dashboard page.tsx — ungenutzte Imports und Berechnungen

- **Datei:** `src/app/dashboard/page.tsx:22-27, 33-38, 84-120`
- **Problem:** `StatsCard`, `RowSkeleton`, `Card`, `QUICK_ACTIONS`, `statCards`, `gettingStarted`, `deadlines` werden importiert/berechnet aber nie verwendet (seit `WidgetDashboard` alles rendert).
- **Fix:** Unbenutzte Imports und Berechnungen entfernen (Dead Code)
- **Status:** ⬜ offen

### TODO-014: Topbar-Search: Klick auf Suchergebnis navigiert nicht zum Ergebnis

- **Datei:** `src/components/dashboard/topbar.tsx:382-387`
- **Problem:** Klick auf ein Suchergebnis navigiert zu `/dashboard/brain?q=${searchQuery}` statt zum spezifischen Ergebnis (`/dashboard/brain/${item.slug}`). Der `item.slug` ist verfügbar wird aber nicht verwendet.
- **Fix:** `router.push(`/dashboard/brain/${item.slug}`)` beim Klick verwenden, oder zumindest `/dashboard/brain?q=${searchQuery}&slug=${item.slug}`
- **Status:** ⬜ offen

### TODO-015: Onboarding-Page verwendet `min-h-screen` innerhalb Dashboard-Layout

- **Datei:** `src/app/dashboard/onboarding/page.tsx:144`
- **Problem:** `min-h-screen` auf dem Onboarding-Container verursacht Double-Scroll, da Dashboard-Layout bereits `h-screen overflow-hidden` hat und `<main>` scrollt.
- **Fix:** `min-h-screen` → `min-h-full` oder `h-full` mit `items-center justify-center` im `<main>`-Kontext
- **Status:** ⬜ offen

---

## P2 — Medium (Polish, Performance)

### TODO-016: Brain-Status im Sidebar-Collapsed-Mode hat kein `role="status"`

- **Datei:** `src/components/dashboard/sidebar.tsx:384-394`
- **Problem:** Collapsed Brain-Status-Indicator ist ein `<span>` ohne `role="status"`. Screenreader erfassen den Status nicht.
- **Fix:** `role="status"` + `aria-label` hinzufügen
- **Status:** ⬜ offen

### TODO-017: Sidebar-Filter Clear-Button hat falsches `aria-label`

- **Datei:** `src/components/dashboard/sidebar.tsx:419`
- **Problem:** Clear-Button im Sidebar-Filter verwendet `aria-label={t("sidebar.filter_placeholder")}` ("Navigation filtern…") statt z.B. "Filter zurücksetzen".
- **Fix:** Neuen `D`-Key `"sidebar.clear_filter"` definieren mit `{ de: "Filter löschen", en: "Clear filter" }` und verwenden
- **Status:** ⬜ offen

### TODO-018: Command-Palette-Backdrop hat kein `aria-hidden` korrekt positioniert

- **Datei:** `src/components/dashboard/command-palette.tsx:616-620`
- **Problem:** Backdrop hat `aria-hidden="true"` ✅, aber der Dialog-Container hat keinen `aria-labelledby` der auf einen sichtbaren Titel verweist.
- **Fix:** `aria-label="Command Palette"` ist vorhanden ✅ — bei genauerer Prüfung OK. Ggf. durch `aria-labelledby` mit sichtbarem Heading ersetzen.
- **Status:** ⬜ offen (niedrige Priorität)

### TODO-019: Dream-Cycle-Widget hat keinen Link zur Dream-Settings

- **Datei:** `src/components/dashboard/widget-dashboard.tsx:323`
- **Problem:** Dream-Cycle-Widget verlinkt zu `/dashboard/settings` (allgemein) statt zu `/dashboard/settings` mit aktivem Dream-Tab. Nutzer landet auf Brain-Settings-Tab.
- **Fix:** Entweder Deep-Link `?tab=dream` implementieren oder direkt auf `/dashboard/settings#dream` verlinken
- **Status:** ⬜ offen

### TODO-020: Branchen-Sektion — 7 deaktivierte Items als toter UI-Block

- **Datei:** `src/components/dashboard/sidebar.tsx:169-188`
- **Problem:** Alle 7 Branchen-Items sind `comingSoon: true` und disabled. Das ist ein großer Block toter UI, der den Nutzer verwirrt.
- **Fix:** Entweder Sektion ausblenden bis mindestens eine Branche aktiv ist, oder in einen "Coming Soon"-Collapse verpacken
- **Status:** ⬜ offen

---

## P3 — Low (Nice-to-have)

_(keine in dieser Runde)_

---

## Abhak-Reihenfolge (Empfehlung)

1. **TODO-001** (Sidebar Playbooks Key) — 1-Zeilen-Fix, sofort
2. **TODO-010** (Deadlines router.push) — 1-Zeilen-Fix, sofort
3. **TODO-012** (Topbar Dead Code) — 1-Zeilen-Fix, sofort
4. **TODO-011** (Widget `<a>` → `<Link>`) — Quick Fix
5. **TODO-002** (Command Palette fehlende Items) — Mittel
6. **TODO-004** (Notification Items fokussierbar) — Mittel
7. **TODO-005** (Settings ARIA Tablist) — Mittel
8. **TODO-003** (Command Palette i18n) — Groß
9. **TODO-006 + 007 + 008 + 009** (i18n Hardcoded DE) — Batch
10. **TODO-013** (Dead Code page.tsx) — Quick Fix
11. **TODO-014** (Search Result Navigation) — Mittel
12. **TODO-015** (Onboarding min-h-screen) — Quick Fix
13. **TODO-016-020** (Polish) — Batch

---

## Nächste Schritte

1. **Diesen Plan abarbeiten** — P0 zuerst, dann P1, dann P2
2. **Nach jedem Fix:** Visueller Check im Browser (`localhost:3000/dashboard`)
3. **Nach P0+P1:** Playwright E2E Smoke-Test laufen lassen
4. **Link-Audit Phase 2:** Jede Subpage einzeln prüfen (Inhalt, Funktionalität, Querverweise)
