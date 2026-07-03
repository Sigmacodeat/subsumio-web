# Subsumio Dashboard UX-Audit & Umbau-Blueprint

> **Datum:** 2026-07-03
> **Scope:** Dashboard-Frontend — Sidebar, Topbar, Copilot, Main-Bereich, Command-Palette, Akten-Detail, Mobile, Barrierefreiheit
> **Methodik:** Code-Audit (sidebar.tsx, topbar.tsx, copilot-sidebar.tsx, layout.tsx, widget-board.tsx, command-palette.tsx, matter-tab-bar.tsx, page.tsx) + Benchmark gegen Harvey / Legora / CoCounsel Dashboard-Patterns
> **Kontext:** Feature-Parität mit Harvey ist laut Competitor-Audit (2026-06-28) erreicht bzw. übertroffen. Dieses Audit behandelt ausschließlich **UX, Informationsarchitektur und Barrierefreiheit** — die Lücke zwischen "alles ist da" und "alles ist im Arbeitsalltag intuitiv erreichbar".

---

## 1. Executive Summary

**Gesamturteil: 82/100 — technisch stark, informationsarchitektonisch überladen.**

| Bereich                | Score | Kernbefund                                                                                                           |
| ---------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| Layout-Shell & Technik | 93    | Focus-Traps, inert, Skip-Link, reduced-motion, Theme-Init ohne Flash — vorbildlich                                   |
| Sidebar / IA           | 68    | **78 Navigationspunkte**, Sektion "Dokumente & Drafting" allein 18 Items, Admin 22. Harvey: ~6 Top-Level-Items       |
| Topbar & Suche         | 78    | Globale Suche findet nur Brain-Pages, keine Akten/Kontakte/Fristen. Notifications nicht klickbar                     |
| Copilot-Panel          | 84    | Stark (Kontext-Card, Quick-Actions, Proactive Alerts) — aber Default-Modus "Activity" statt Chat, Feed ohne Realtime |
| Main-Bereich / Home    | 88    | Widget-Board mit DnD + Prefs ist Harvey-überlegen. Kleinere Konsistenzfehler                                         |
| Akten-Detail           | 90    | 10 Tabs mit Primary/Secondary-Split (Miller's Law) — bester Teil des Produkts                                        |
| Barrierefreiheit       | 74    | Single-Key-Shortcuts (WCAG 2.1.4 ✗), Zielgrößen < 24px (2.5.8 ✗), 10–11px-Mikrotypografie                            |
| Konsistenz / i18n      | 80    | Hartkodierte DE/EN-Ternaries neben t()-System, 2 Orphan-Routen, Icon-Dopplungen                                      |

**Die eine strategische Erkenntnis:** Harvey gewinnt UX-Vergleiche nicht durch Features, sondern durch _Weglassen_. Harvey zeigt 5–6 Einstiege (Assistant, Vault, Workflows, Library, History) und lässt alles andere hinter Suche + Kontext verschwinden. Subsumio zeigt heute die komplette Feature-Liste als Navigation. Der Umbau ist kein Redesign — die Bausteine (Command-Palette, Copilot, Widget-Board, Matter-Tabs) sind alle da und hochwertig. Es ist eine **Umverteilung: aus der Sidebar heraus, in Suche, Kontext und Werkbänke hinein.**

---

## 2. Benchmark: Was machen Harvey, Legora & Co. im Dashboard richtig?

| Prinzip                                                                                        | Harvey                 | Legora        | Subsumio heute                                                         |
| ---------------------------------------------------------------------------------------------- | ---------------------- | ------------- | ---------------------------------------------------------------------- |
| **Assistant-first**: KI ist der Haupteinstieg, nicht ein Menüpunkt                             | ✅ Startseite = Prompt | ✅            | ⚠️ Chat ist 1 von 6 Primary-Items; Copilot startet im "Activity"-Modus |
| **Flache Navigation** (≤7 Top-Level)                                                           | ✅ ~6                  | ✅ ~7         | ❌ 6 Primary + 6 Sektionen + Admin = 78 Items                          |
| **Projekt-/Matter-zentriert**: Arbeit passiert im Kontext einer Akte                           | ✅ Projects            | ✅ Workspaces | ✅ Matter-Tabs + MatterSidebarSection + Matter-Switcher — Parität      |
| **Föderierte Suche** über alle Objekttypen                                                     | ✅                     | ✅            | ❌ Suche = nur Brain-Pages                                             |
| **History/Recents** als eigene Dimension                                                       | ✅                     | ✅            | ⚠️ Recent Queries als Widget, Matter-Switcher recent — verstreut       |
| **Werkzeuge erscheinen im Kontext**, nicht im Menü (Redline im Vertrag, Translate im Dokument) | ✅                     | ✅            | ❌ Translate, Analyze, Deep-Analysis, Tabular-Review sind Menüpunkte   |

Subsumios strukturelle Vorteile, die kein Konkurrent hat und die der Umbau **schützen** muss: Fristen-first (Anwaltshaftung!), Quick-Create überall, Offline-Queue, Widget-Personalisierung, beA/RVG/DATEV-Tiefe.

---

## 3. Befunde im Detail

### 3.1 Sidebar & Informationsarchitektur (`src/components/dashboard/sidebar.tsx`)

**S1 — Nav-Überladung (P1).** LEGAL_NAV: 6 Primary + 7/3/18/11/8/9 Sektions-Items + 22 Admin = ~78 sichtbare Einträge. "Dokumente & Drafting" (18 Items) mischt Werkzeuge (Analyze, Translate, Tabular-Review), Objekte (Contracts, Templates, Vault) und Analytics (Litigation-Analytics, Portfolio-Insights). Kognitive Last statt Führung.

**S2 — Fehlkategorisierung (P1).** In "Dokumente & Drafting" liegen: `trust-accounting` (gehört zu Abrechnung), `litigation-analytics` + `portfolio-insights` (Analytics), `litigation` (eigener Workflow). `adoption-analytics` erscheint doppelt (Operations + Admin).

**S3 — Fünf Recherche-Einstiege (P1).** `research`, `rechtsprechung`, `norms`, `precedent-search`, `judgements-db` (+ `commentaries`, `judgements-sync`, `brain`) sind acht getrennte Menüpunkte für einen einzigen Nutzer-Job: "Finde die Rechtslage." Kein Anwalt weiß ohne Training, welcher Einstieg der richtige ist.

**S4 — Farb-Bug Primary-Items (P0, verifiziert).** `PRIMARY_COLOR_VARS` (sidebar.tsx:211) hat **5** Einträge, `PRIMARY_ITEMS` hat **6** (Altlasten wurde eingefügt, ohne die Farbliste zu erweitern). Folge: Intake bekommt die Chat-Farbe (`--nav-cat-comm`), Chat fällt auf `--nav-cat-cases` zurück — die Kategorie-Farbcodierung ist ab Index 2 um eins verschoben.

**S5 — Icon-Dopplungen (P2).** `Scale` für Gegner UND Kollisionsprüfung (direkt untereinander), `FileText` ×6, `FileSearch` ×5, `BookOpen` ×2, `Database` ×3. Icons verlieren ihre Wiedererkennungsfunktion — im Collapsed-Modus (nur Icons!) sind Einträge nicht mehr unterscheidbar.

**S6 — Orphan-Routen (P2, verifiziert).** `/dashboard/assistant` und `/dashboard/query` existieren als Pages, kommen aber weder in Sidebar noch Command-Palette vor. Entweder einbinden oder löschen — tote Fläche verwirrt bei Deep-Links und kostet Wartung.

**S7 — Positiv (behalten!).** Accordion mit Auto-Open der aktiven Sektion, Kategorie-Farbsystem, Sidebar-Filter mit Highlight, MatterSidebarSection (aktenbezogene Navigation), Brain-Status-Pill mit echtem Reachability-Signal, Offline-/Sync-Status, ArrowUp/Down-Navigation. Das ist agenturreif.

### 3.2 Topbar & Suche (`src/components/dashboard/topbar.tsx`)

**T1 — Suche ist nicht föderiert (P1).** `useSearch` sucht nur Brain-Pages. Ein Anwalt, der "Müller" tippt, erwartet: Akte Müller ./. Schmidt, Kontakt Müller, Dokumente, Fristen — bekommt aber nur Wissensseiten. Harvey/Legora führen hier klar. Die Command-Palette (⌘K) kann wiederum **nur navigieren**, keine Inhalte finden. Zwei halbe Suchen statt einer ganzen.

**T2 — Inkonsistentes Suchverhalten (P0, verifiziert).** Enter auf einem ausgewählten Treffer navigiert zu `/dashboard/brain/<slug>` (Zeile 461), **Klick auf denselben Treffer** navigiert zu `/dashboard/brain?q=` (Zeile 516) — Maus und Tastatur führen zu verschiedenen Zielen.

**T3 — ⌘K-Hint auf dem falschen Element (P2).** Das Suchfeld zeigt ein ⌘K-Badge, aber ⌘K öffnet die Command-Palette (anderes Overlay, andere Fähigkeiten). Affordanz-Bruch: Nutzer lernt "⌘K = dieses Feld" und landet woanders.

**T4 — Notifications sind Sackgassen (P1).** Notification-Items sind `role="menuitem"`-Divs mit tabIndex, aber **ohne Aktion** — kein Klick zur Akte/Frist, obwohl `caseSlug` in den Daten vorhanden ist. Eine Fristenwarnung, die nicht zur Frist führt, ist im Anwaltsalltag fast wertlos. Zusätzlich: role="menuitem" ohne Aktivierbarkeit ist eine ARIA-Verletzung.

**T5 — Quick-Create fehlt auf Mobile (P2).** Der gesamte rechte Topbar-Block ist `max-md:hidden`; Quick-Create (der wichtigste Schreib-Einstieg) hat mobil keinen Ersatz außer der Tab-Bar-Route.

**T6 — Positiv.** Quick-Create mit Matter-Scope ("Diese Akte" vs. "Allgemein") ist besser als alles, was Harvey anbietet. Notification-Deduplizierung API vs. Client, Batch-Sync, Realtime-Refresh — solide Architektur.

### 3.3 Copilot-Panel (`src/components/chat/copilot-sidebar.tsx`)

**C1 — Falscher Default-Modus (P1).** `panelMode` startet mit `"activity"`. Der Kern-Wert des Produkts ist der Chat mit Citations; die Activity-Liste (agent_action-Pages, einmaliger Fetch) ist sekundär. Harvey öffnet IMMER auf dem Prompt. Empfehlung: Default `chat`, Activity als Tab beibehalten; letzten Modus persistieren.

**C2 — Activity-Feed ist statisch (P2).** Einmaliger Fetch beim Mount, kein Polling, kein `useRealtime`-Hook — obwohl die Infrastruktur (`ensureRealtime`, `useRealtime`) existiert und in der Topbar bereits genutzt wird. Ein "Activity"-Feed, der nicht lebt, wirkt kaputt.

**C3 — Escape schließt das Arbeits-Panel (P2, verifiziert).** Der globale Escape-Handler (Zeile 968) schließt das Copilot-Panel auch auf Desktop. Persistente Workspace-Panels sollten nicht auf Esc reagieren — Esc gehört Dialogen/Popovern. Kollisionsrisiko: Dialog offen + Esc → Dialog UND Copilot schließen.

**C4 — Route-Kontext deckt ~12 von 85 Routen ab (P2).** `ROUTE_PATTERNS` ist ein starkes Konzept, aber Tax-Routen, Litigation, Review-Sets, Tabular-Review etc. fallen auf den generischen Kontext zurück. Gerade dort (komplexe Werkzeuge) wären Quick-Actions am wertvollsten.

**C5 — Hartkodierte Strings (P2).** `"Loading…" : "Laden…"`, MatterContextCard-Labels, Topbar-`aria-label="Copilot schließen"` — alles per `lang`-Ternary statt `t()`. Funktioniert, bricht aber das i18n-System und macht künftige Sprachen teuer.

**C6 — Positiv.** MatterContextCard (Fristen/Aufgaben/Doku-Zähler + nächste Frist), Proactive Deadline-Alerts mit Dismiss, Resizable mit Tastatur-Support, Focus-Trap + inert + Focus-Restore — das Panel ist strukturell Harvey-Klasse.

### 3.4 Main-Bereich / Dashboard-Home (`src/app/dashboard/page.tsx`, `widget-board.tsx`)

**M1 — "KI fragen"-Feld erzwingt Full-Page-Reload (P0, verifiziert).** `window.location.href = '/dashboard/chat?q='` (page.tsx:80) statt `router.push` — wirft den gesamten App-State weg (Copilot-Zustand, Query-Cache) für die wichtigste Aktion der Startseite.

**M2 — Zwei konkurrierende Chat-Oberflächen (P1, strategisch).** `/dashboard/chat` (Vollseite) und Copilot-Chat (Panel) sind getrennte Einstiege. Das Home-Suchfeld navigiert zur Vollseite, obwohl rechts bereits ein Chat-Panel offen sein kann. Empfehlung: Eine Session-Basis, das Panel als "Mini-Ansicht" derselben Konversation, "Erweitern"-Knopf Panel→Vollseite (Harvey-Pattern: Thread folgt dem Nutzer).

**M3 — Positiv (Differenzierer!).** Widget-Board mit dnd-kit, Sichtbarkeits-Toggles, Server-Prefs, Degraded-Banner, Empty-State mit Reset, Keyboard-Sortierung — **kein Konkurrent hat ein personalisierbares Kanzlei-Cockpit.** HeutePanel + Rundown = richtige Priorität (Fristen zuerst). Nicht anfassen, nur polieren.

### 3.5 Akten-Detail (`matter-tab-bar.tsx`, `matter-tabs/`)

**A1 — Bester Teil des Produkts.** 5 Primary-Tabs + 5 im "Mehr"-Menü, URL-basiert, Miller's Law dokumentiert. Einziger Befund: Tab-Label "KI" für `strategy` und "Assistent" für `ai` — zwei KI-benannte Tabs verwirren (P2): Strategy in "Strategie" umbenennen.

### 3.6 Barrierefreiheit (WCAG 2.2 AA)

**B1 — Single-Key-Shortcuts verletzen WCAG 2.1.4 (P1, verifiziert).** `n/d/i/s/c` ohne Modifier (layout.tsx:310–337) öffnen Dialoge. Zwar mit isTyping-Guard, aber: (a) Screenreader-/Schaltersteuerungs-Nutzer feuern sie versehentlich, (b) WCAG 2.1.4 verlangt Abschaltbarkeit oder Remapping — beides fehlt. Fix: Settings-Toggle "Einzeltasten-Shortcuts" + Anzeige in der Shortcut-Hilfe (Shift+?).

**B2 — Zielgrößen unter 24px (WCAG 2.5.8, P2).** Copilot-Collapse-Tab: 14px breit (`w-3.5`); diverse h-6/h-7-Icon-Buttons in dichten Bereichen. Mindestens 24×24px oder ausreichend Abstand.

**B3 — Mikrotypografie 10–11px flächendeckend (P2).** `text-[10px]`/`text-[11px]` in Copilot-Header, Matter-Card, Chips, Badges. Zielgruppe Anwält:innen 40+; unter 12px leidet Lesbarkeit messbar. Token-basiertes Minimum von 12px für alles Informationstragende (reine Deko-Kbd ausgenommen).

**B4 — role="menuitem" ohne Aktion** (siehe T4) — ARIA-Semantik-Verletzung.

**B5 — Positiv.** Skip-Link, Focus-Traps (Layout + Copilot), inert-Attribute, Focus-Restore, `prefers-reduced-motion` via zentralem `useDashboardMotion`, aria-current/aria-expanded konsequent, Statusmeldungen mit `role="status"` + `aria-live`. Fundament ist deutlich über Branchenschnitt — die Lücken sind punktuell, nicht strukturell.

---

## 4. Ziel-Informationsarchitektur (der Umbau)

### 4.1 Leitprinzip: „5 Orte + 1 Suche + 1 Copilot"

Ein Anwaltsalltag hat fünf Orte. Alles andere ist Werkzeug und erscheint **im Kontext** oder über die **Suche**:

```
┌──────────────────────────────────────────────────────────────┐
│ PRIMARY (immer sichtbar, farbcodiert)                        │
│  1. Heute        (Cockpit — Fristen, Posteingang, Rundown)   │
│  2. Akten        (+ Altlasten als Filter-Tab, nicht Nav-Item)│
│  3. Fristen                                                  │
│  4. Posteingang  (Intake + beA + E-Mail + WhatsApp vereint)  │
│  5. Recherche    (Hub: Gesetze·Urteile·Kommentare·Präzedenz) │
├──────────────────────────────────────────────────────────────┤
│ WERKBÄNKE (Accordion, je ≤7 Items)                           │
│  · Dokumente     (Vault, Upload, Analyze-Hub, Review-Sets)   │
│  · Verträge      (Contracts, Klauseln, Templates, Signatur,  │
│                   Obligation-Tracking, Playbooks)            │
│  · Prozess       (Litigation, Strategie, Beweise, Analytics) │
│  · Abrechnung    (Invoicing, RVG, Trust, DATEV, Controlling) │
│  · Kanzlei       (Reports, Analytics, Workflows, Approvals,  │
│                   Shared Spaces, Monitoring)                 │
│  · Compliance    (wie heute, 9 Items ok)                     │
├──────────────────────────────────────────────────────────────┤
│ ADMIN (nur für Admin-Rolle sichtbar — 22 Items raus aus der  │
│ Nav normaler Nutzer; Zugriff via Palette + /settings-Hub)    │
└──────────────────────────────────────────────────────────────┘
```

Regeln:

- **Werkzeuge raus aus der Nav:** Translate, Anonymize, Deep-Analysis, Case-Scanner, Tabular-Review werden Aktionen auf Dokumenten/Akten (Kontextmenü, Copilot-Quick-Action, Palette) — nicht Ziele. Die Pages bleiben als Deep-Link-Ziele bestehen.
- **Recherche-Hub statt 8 Einstiege:** Eine `/dashboard/research`-Oberfläche mit Quellen-Tabs (Gesetze / Rechtsprechung / Kommentare / Eigene Präzedenzfälle / Brain). Sync/DB-Verwaltung wandert zu Admin.
- **Posteingang vereint:** Intake, beA, E-Mail-Import, WhatsApp als Kanäle EINER Inbox mit Kanal-Filter (die Backends existieren bereits getrennt — es ist eine reine Frontend-Aggregation).
- **Rollen-Sichtbarkeit:** ReFa sieht Abrechnung + Fristen prominent, Anwalt sieht Recherche + Prozess, Admin sieht alles. `navForIndustry()` wird zu `navForProfile(industry, role)` — die Architektur dafür existiert schon.
- **"Alle Funktionen"-Seite** als Sicherheitsnetz: durchsuchbares Verzeichnis aller 85 Routen (ersetzt die Angst, etwas "unauffindbar" zu machen).

### 4.2 Suche: eine föderierte Palette

⌘K wird die EINE Suche (Harvey-Pattern): Eingabe durchsucht parallel Navigation, Akten, Kontakte, Dokumente, Fristen, Brain-Pages — gruppiert nach Typ, mit "in Chat fragen"-Fallback als letzter Zeile (Eingabe → Copilot-Query). Das Topbar-Suchfeld bleibt als sichtbarer Einstieg, öffnet aber dieselbe Palette (kein zweites Verhalten). Die APIs existieren (`useSearch`, `usePages`, cases/contacts-Endpoints) — es fehlt nur die Aggregation.

### 4.3 Copilot: Chat-first, überall kontextfähig

1. Default-Tab **Chat**, letzter Modus persistiert.
2. Route-Kontexte für alle Werkbank-Routen ergänzen (Tax, Litigation, Review, Tabular).
3. Activity-Tab an `useRealtime` anbinden.
4. Chat-Sessions zwischen Panel und `/dashboard/chat` vereinheitlichen ("Im Vollbild öffnen"-Knopf, gleiche Session-ID).
5. Esc schließt das Panel nicht mehr (nur ⌘J toggelt).

---

## 5. TODO-Blueprint (priorisiert, mit Dateibezug)

### Phase 0 — Sofort-Fixes (Bugs, ~1 Tag)

- [ ] **P0** `PRIMARY_COLOR_VARS` um 6. Eintrag ergänzen und Reihenfolge an `PRIMARY_ITEMS` angleichen — [sidebar.tsx:211](src/components/dashboard/sidebar.tsx:211)
- [ ] **P0** Topbar-Suche: Klick-Handler auf dasselbe Ziel wie Enter (`/dashboard/brain/<slug>`) — [topbar.tsx:516](src/components/dashboard/topbar.tsx:516)
- [ ] **P0** Home "KI fragen": `router.push` statt `window.location.href` — [page.tsx:80](src/app/dashboard/page.tsx:80)
- [ ] **P1** Notifications klickbar machen: Deadline-Notifs → `/dashboard/cases/<caseSlug>?tab=deadlines`, als `<button>`/`<Link>` statt Div; `role="menuitem"`-Semantik reparieren — [topbar.tsx:642](src/components/dashboard/topbar.tsx:642)
- [ ] **P1** Copilot-Default `panelMode: "chat"` + Persistenz in localStorage — [copilot-sidebar.tsx:766](src/components/chat/copilot-sidebar.tsx:766)
- [ ] **P2** Esc-Handler im Copilot auf Mobile-Drawer beschränken — [copilot-sidebar.tsx:968](src/components/chat/copilot-sidebar.tsx:968)
- [ ] **P2** Hartkodierte Strings nach `t()` migrieren: Topbar-Copilot-Labels ([topbar.tsx:891](src/components/dashboard/topbar.tsx:891)), ActivityFeedPanel, MatterContextCard, Quick-Create-Matter-Items
- [ ] **P2** Orphans klären: `/dashboard/assistant` + `/dashboard/query` einbinden (Palette reicht) oder entfernen
- [ ] **P2** Matter-Tab "KI" (strategy) → "Strategie" umbenennen — [matter-tab-bar.tsx](src/components/legal/matter-tab-bar.tsx)

### Phase 1 — IA-Umbau Sidebar (~3–4 Tage)

- [ ] **P1** Nav-Restrukturierung nach 4.1: Primary auf 5 reduzieren (Altlasten → Filter-Tab in `/dashboard/cases`), Werkbänke neu schneiden, Fehlkategorisierungen beheben (trust-accounting → Abrechnung, litigation-analytics/portfolio-insights → Prozess/Kanzlei) — `NAV_SECTIONS` in [sidebar.tsx:84](src/components/dashboard/sidebar.tsx:84)
- [ ] **P1** Recherche-Hub: `/dashboard/research` als Tab-Oberfläche (Gesetze/Urteile/Kommentare/Präzedenz/Brain); alte Routen bleiben, redirecten aber sichtbar in den Hub-Tab
- [ ] **P1** Admin-Sektion rollenbasiert ausblenden (`navForProfile(industry, role)`); Nicht-Admins sehen Settings + Team nur in den Bottom-Items
- [ ] **P2** Icon-Eindeutigkeit: pro Sidebar-Eintrag ein einmaliges Icon (Kollisionsprüfung ≠ Gegner, FileText-Sechsfachbelegung auflösen)
- [ ] **P2** "Alle Funktionen"-Verzeichnisseite (`/dashboard/directory`) aus `ALL_NAV_ITEMS` generieren
- [ ] **P2** Sidebar-Filter um Synonyme/Keywords erweitern (Palette-`keywords`-Feld wiederverwenden)
- [ ] **P2** Sidebar-Tests aktualisieren — [sidebar.test.tsx](src/components/dashboard/sidebar.test.tsx)

### Phase 2 — Föderierte Suche & Copilot (~4–5 Tage)

- [ ] **P1** Command-Palette föderieren: Sektionen Navigation / Akten / Kontakte / Dokumente / Fristen / Wissen + "→ Copilot fragen"-Fallback-Zeile — [command-palette.tsx](src/components/dashboard/command-palette.tsx)
- [ ] **P1** Topbar-Suchfeld öffnet die Palette (ein Suchverhalten statt zwei); ⌘K-Hint stimmt damit wieder
- [ ] **P1** Posteingang-Aggregation: `/dashboard/intake` zeigt Kanal-Tabs (Intake / beA / E-Mail / WhatsApp) — Frontend-Aggregation über bestehende Endpoints
- [ ] **P1** Chat-Session-Vereinheitlichung Panel ↔ `/dashboard/chat` ("Im Vollbild öffnen", gemeinsame Session-Store-Basis) — [chat-session-store.ts](src/components/chat/chat-session-store.ts)
- [ ] **P2** Copilot-Route-Kontexte für Litigation, Review-Sets, Tabular-Review, Tax-Routen ergänzen — `ROUTE_PATTERNS` in [copilot-sidebar.tsx:69](src/components/chat/copilot-sidebar.tsx:69)
- [ ] **P2** Activity-Feed an `useRealtime("notification.created" / page-events)` anbinden + Refresh-Intervall
- [ ] **P2** Werkzeug-Kontextualisierung: Translate/Analyze/Anonymize als Aktionen im Dokument-Kontext (Vault-Zeilenmenü, Copilot-Quick-Action) statt nur als Nav-Ziele

### Phase 3 — Barrierefreiheit & Feinschliff (~2–3 Tage)

- [ ] **P1** WCAG 2.1.4: Settings-Toggle "Einzeltasten-Shortcuts (n/d/i/s/c)" + Abbildung in der Shortcut-Hilfe — [layout.tsx:310](src/app/dashboard/layout.tsx:310), [keyboard-shortcuts.tsx](src/components/dashboard/keyboard-shortcuts.tsx)
- [ ] **P2** Zielgrößen-Pass: alle interaktiven Elemente ≥24×24px (Copilot-Collapse-Tab, dichte Icon-Buttons)
- [ ] **P2** Typografie-Pass: informationstragender Text ≥12px; `text-[10px]/[11px]` auf Deko/Kbd beschränken (Token statt Ad-hoc-Werte)
- [ ] **P2** Kontrast-Audit beider Themes (insb. `--ds-text-subtle` auf `--ds-surface-2`) — Ziel 4.5:1
- [ ] **P2** Quick-Create-Zugang auf Mobile (FAB oder Tab-Bar-Eintrag) — [mobile-tab-bar.tsx](src/components/dashboard/mobile-tab-bar.tsx)

### Phase 4 — Verifikation (~1–2 Tage)

- [ ] **P1** Playwright: Keyboard-only-Walkthrough (Login → Akte → Frist anlegen → Copilot-Query → Suche), axe-core-Scan auf den 10 Kernrouten in CI
- [ ] **P1** Visueller Regressionslauf beider Themes (Preview-Screenshots Sidebar collapsed/expanded, Copilot offen/zu, Mobile)
- [ ] **P2** 5-Sekunden-Test mit Zielnutzern: "Finde X" für die 10 häufigsten Aufgaben — Erfolgsquote vor/nach IA-Umbau messen

**Aufwand gesamt: ~11–15 Personentage.** Phase 0 ist unabhängig sofort shipbar; Phasen 1–3 je als eigener PR-Zug mit `/ship`.

---

## 6. Was ausdrücklich NICHT umgebaut wird

- **Widget-Board / Cockpit** — Alleinstellungsmerkmal, nur Phase-0-Politur.
- **Matter-Detail (10 Tabs)** — bereits Best-in-Class-Struktur.
- **Quick-Create-System** (Events + Dialoge + Matter-Scope) — besser als Harvey; wird durch Mobile-Zugang nur ergänzt.
- **Motion-/Theme-System, Focus-Management-Fundament** — agenturreif, Referenzqualität.
- **Feature-Umfang** — kein Feature wird entfernt; Routen bleiben als Deep-Link-Ziele erhalten. Der Umbau ändert Auffindbarkeit, nicht Existenz.
