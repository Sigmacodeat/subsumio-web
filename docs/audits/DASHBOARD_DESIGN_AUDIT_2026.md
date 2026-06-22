# Dashboard Design Audit — Agency-Level Report

**Datum:** 2026-06-21  
**Scope:** Subsumio Dashboard Frontend (`/dashboard/*`)  
**Auditor:** Principal Engineer / UX Lead  
**Referenz-Systeme:** Notion, Linear, Vercel Dashboard, Stripe Dashboard  
**Ziel:** Maximale Design-Perfektion, professionelle UX, WCAG 2.2 AA, Dark + Light Mode

---

## 1. Audit-Methodik

Analysiert wurden:

- **Design Tokens:** `src/app/globals.css` (1334 Zeilen)
- **Dashboard Shell:** `src/app/dashboard/layout.tsx`
- **Sidebar:** `src/components/dashboard/sidebar.tsx` (771 Zeilen)
- **Topbar:** `src/components/dashboard/topbar.tsx` (715 Zeilen)
- **Dashboard Page:** `src/app/dashboard/page.tsx`
- **Widget Dashboard:** `src/components/dashboard/widget-dashboard.tsx` (710 Zeilen)
- **Mobile Tab Bar:** `src/components/dashboard/mobile-tab-bar.tsx`
- **UI Primitives:** `Button`, `Badge`, `Card`, `Skeleton`, `StatsCard`
- **Theme System:** `industry-theme.ts`, `industry-pack.ts`, `subsumio-theme.tsx`
- **Accessibility:** `a11y-baseline.ts`, `theme-init.js`
- **Fonts:** `src/app/layout.tsx` (Inter, Space Grotesk, JetBrains Mono)

---

## 2. Audit-Ergebnisse

### 2.1 Farben & Design Tokens

#### Was gut ist

- Systematisches Token-System mit `--ds-*` (Design System) und `--brand-*` (Brand) Variablen
- Separate Token-Sets für Light/Dark/Dashboard mit `data-app` + `data-theme` Attributen
- Industry-Theming über `styleForIndustry()` mit dynamischen `--brand-*` Overrides
- `color-scheme` korrekt gesetzt für beide Modi
- Card-Shadows als CSS-Variablen definiert (theme-aware)

#### Kritische Issues

| #    | Issue                                                                                                                                                                               | Severity     | Datei                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------- |
| C-01 | **AI-GENERISCHES LEFT-BORDER PATTERN** — `shadow-[inset_2px_0_0_var(--brand-primary)]` auf aktiven Sidebar-Items. Das ist das #1 AI-UI-Cliché.                                      | **BLOCKING** | `sidebar.tsx:615,663,697,782` |
| C-02 | **Button `danger` variant** verwendet `text-red-400` — zu hell auf weißem Light-Mode Background. WCAG AA Fail: ~3.2:1 auf weiß.                                                     | **SERIOUS**  | `button.tsx:19`               |
| C-03 | **Badge `success/warning/danger/info`** verwenden rohe Tailwind-Colors (`text-emerald-700` etc.) — nicht theme-aware. `emerald-700` auf Dark-Mode `#12151c` ist zu dunkel (~3.5:1). | **SERIOUS**  | `badge.tsx:11-14`             |
| C-04 | **Dark Mode `--brand-primary: #3b5c85`** zu entsättigt — wirkt ausgewaschen, kein visueller Akzent. Linear/Vercel nutzen gesättigtere Akzente im Dark Mode.                         | **MODERATE** | `globals.css:936`             |
| C-05 | **`--brand-text` im Dark Mode = `--brand-secondary` (Gold)** — Alle Brand-Text-Elemente werden gold. Ungewöhnlich, inkonsistent mit Light Mode (wo es Navy ist).                    | **MODERATE** | `globals.css:945`             |
| C-06 | **Marketing → Dashboard Brand-Bruch** — Marketing: `#2f6bff` (Blau) + `#20d3c2` (Teal) + `#8b5cf6` (Purple). Dashboard: `#1a365d` (Navy) + `#b48a2a` (Gold). Harter Übergang.       | **MODERATE** | `globals.css`                 |
| C-07 | **Degraded-Warning `text-amber-800`** in `widget-dashboard.tsx:602-603` — NICHT von Dark-Mode Overrides erfasst. `amber-800` auf `#12151c` = WCAG Fail.                             | **SERIOUS**  | `widget-dashboard.tsx:602`    |
| C-08 | **Dark Mode Borders zu subtil** — `--ds-border: #2a303c` auf `--ds-surface: #12151c` = ~1.8:1 Kontrast. Karten verschmelzen.                                                        | **MODERATE** | `globals.css:933`             |

---

### 2.2 Typographie & Fonts

#### Was gut ist

- Self-hosted Fonts via `next/font` (GDPR-konform, kein Google-Request)
- Inter (Body), Space Grotesk (Display), JetBrains Mono (Code) — solide Wahl
- Type-Scale mit `--ds-text-*` Tokens definiert
- `tabular-nums` für Stat-Numbers — gut für Daten-Dashboards
- `font-feature-settings` für Inter aktiviert

#### Issues

| #    | Issue                                                                                                                                                                                                                | Severity     | Datei                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------- |
| T-01 | **Sidebar-Search `text-[13px]`** — unter 14px Empfehlung für Body-Text.                                                                                                                                              | **MINOR**    | `sidebar.tsx`              |
| T-02 | **Brain-Status `text-[11px]` und Entity-Count `text-[10px]`** — sehr klein, Grenzwertig für Sehschwäche.                                                                                                             | **MODERATE** | `sidebar.tsx`              |
| T-03 | **Space Grotesk als einzige Display-Font** — geometrisch/technisch, aber eine sehr häufige AI-Wahl. Für Legal-Tech wäre eine charaktervollere Font (z.B. Söhne, GT America, oder zumindest Inter Display) markanter. | **MINOR**    | `layout.tsx`               |
| T-04 | **Keine `font-display: optional`** — Fonts nutzen `display: swap`, was FOUT verursacht. `optional` wäre für Dashboard besser (kein Flicker).                                                                         | **MINOR**    | `layout.tsx:19-29`         |
| T-05 | **Keine explizite Letter-Spacing-Scale** — `tracking-tight` und `tracking-wider` werden ad-hoc verwendet.                                                                                                            | **MINOR**    | various                    |
| T-06 | **QueuePanel-Title `text-sm`** — zu klein für Section-Header. Modern dashboards nutzen `text-base` oder `text-[15px]` für Panel-Titel.                                                                               | **MODERATE** | `widget-dashboard.tsx:173` |

---

### 2.3 Sidebar & Navigation

#### Was gut ist

- Such-/Filter-Funktionalität mit Keyboard-Support
- Collapsed/Expanded States mit smooth Transition
- Mobile Drawer mit Focus-Trap
- `aria-current="page"` auf aktiven Items
- `aria-expanded`/`aria-controls` auf Accordion-Sections
- Keyboard-Navigation (ArrowUp/ArrowDown) implementiert
- `NAV_SECTIONS` als Datenstruktur — gut wartbar

#### Issues

| #    | Issue                                                                                                                                                                                                                                                     | Severity     | Datei                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------- |
| S-01 | **LEFT-BORDER ACTIVE INDICATOR** — `shadow-[inset_2px_0_0_var(--brand-primary)]`. Das ist das exakte Pattern, das der User eliminieren will. Jedes AI-Projekt macht das. Notion/Linear nutzen: subtile Background-Tint + bolderer Text, KEIN Left-Border. | **BLOCKING** | `sidebar.tsx:615,663,697,782` |
| S-02 | **~60+ Nav-Items in 7+ Sektionen** — Overwhelming. Modern dashboards nutzen 5-8 Top-Level Items mit Progressive Disclosure.                                                                                                                               | **MODERATE** | `sidebar.tsx` NAV_SECTIONS    |
| S-03 | **Section-Icon = erstes Item-Icon** — `const SectionIcon = section.items[0]?.icon ?? FolderOpen`. Semantisch falsch: "Inbox & Deadlines" zeigt Mail-Icon statt Inbox.                                                                                     | **MODERATE** | `sidebar.tsx`                 |
| S-04 | **Keine Badge-Counts auf Nav-Items** — Fristen/Inbox/Reviews sollten Badges mit Anzahlen zeigen.                                                                                                                                                          | **MODERATE** | `sidebar.tsx`                 |
| S-05 | **User-Profile zeigt generisches User-Icon** — Modern dashboards zeigen Initialen oder Avatar.                                                                                                                                                            | **MINOR**    | `sidebar.tsx`                 |
| S-06 | **Dream-Cycle-Indicator nimmt prominenten Platz ein** — Nischen-Feature, sollte subtiler sein oder in Settings.                                                                                                                                           | **MINOR**    | `sidebar.tsx`                 |
| S-07 | **Collapsed-State zeigt keine Tooltips** — Bei `md:w-16` werden nur Icons gezeigt, aber kein `title`-Attribut oder Hover-Tooltip.                                                                                                                         | **MODERATE** | `sidebar.tsx`                 |
| S-08 | **Keine "Pinned Items" / "Favorites"** — Power-User können keine häufigen Seiten pinnen.                                                                                                                                                                  | **MINOR**    | `sidebar.tsx`                 |

---

### 2.4 Topbar

#### Was gut ist

- Theme-Toggle mit Sun/Moon Icons
- Search mit Keyboard-Shortcut (⌘K)
- Notification Dropdown mit Type-basiertem Coloring
- Brain-Selector (conditional)
- User-Menu mit Keyboard-Support
- `h-16` (64px) — Standard-Höhe

#### Issues

| #     | Issue                                                                                                                                          | Severity     | Datei        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------ |
| TB-01 | **Search-Bar zu breit** — `max-w-sm md:max-w-md lg:max-w-lg`. Nimmt zu viel horizontalen Raum. Modern: kompakt, expandiert on focus.           | **MODERATE** | `topbar.tsx` |
| TB-02 | **Icon-Größen inkonsistent** — `size={16}`, `size={18}`, `size={13}` gemischt. Keine systematische Icon-Scale.                                 | **MINOR**    | `topbar.tsx` |
| TB-03 | **Theme-Toggle ist nur ein Button** — Modern dashboards nutzen einen animierten Slide-Toggle (Sun ↔ Moon mit CSS-Transition).                  | **MINOR**    | `topbar.tsx` |
| TB-04 | **Keine Breadcrumb** — Topbar zeigt keinen Context (welche Seite/bin ich). Modern dashboards haben Breadcrumbs oder Page-Titles in der Topbar. | **MODERATE** | `topbar.tsx` |
| TB-05 | **Notification "mark all read"** — Button-Text in `--brand-primary` coloriert. In Dark Mode `#3b5c85` zu entsättigt.                           | **MINOR**    | `topbar.tsx` |

---

### 2.5 Dashboard Page & Widgets

#### Was gut ist

- `WidgetDashboard` mit datengetriebenen Komponenten
- `MetricRail` mit 5-Spalten Grid und `gap-px` (Linear-Style)
- `QueuePanel` / `QueueRow` — saubere Listen-Pattern
- `QuickActions` — 6-Spalten Grid
- Conditional Rendering: First-Time-User Banner, Degraded-Warning
- `tabular-nums` für alle Zahlen
- Loading-State mit Skeletons

#### Issues

| #    | Issue                                                                                                                                                                      | Severity     | Datei                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------ |
| W-01 | **MetricRail-Zahlen `text-2xl`** — zu klein für KPI-Metrics. Modern: `text-3xl` oder `text-[2rem]` (StatsCard hat `text-[2rem]`, MetricRail nur `text-2xl`). Inkonsistent. | **MODERATE** | `widget-dashboard.tsx:535`     |
| W-02 | **Keine Loading-States für einzelne Panels** — Nur `MetricRail` zeigt "—". QueuePanels zeigen leere Listen ohne Skeleton.                                                  | **MODERATE** | `widget-dashboard.tsx`         |
| W-03 | **Empty States funktional aber nicht engaging** — `EmptyLine` = dashed-border Box mit Text. Modern: Icon + Text + CTA.                                                     | **MODERATE** | `widget-dashboard.tsx:147-153` |
| W-04 | **Keine Page-Transition-Animations** — Harte Schnitte zwischen Seiten. Modern: subtile Fade-In (`widget-fade-in` existiert aber wird nicht auf Page-Level angewendet).     | **MINOR**    | `layout.tsx`                   |
| W-05 | **Welcome-Banner design** — Simple bordered Box. Könnte einladender sein mit Gradient oder Icon.                                                                           | **MINOR**    | `page.tsx:42-66`               |
| W-06 | **QueueRow Icon-Container `h-8 w-8`** — zu klein. Modern: `h-9 w-9` oder `h-10 w-10`.                                                                                      | **MINOR**    | `widget-dashboard.tsx:211`     |
| W-07 | **Keine Data-Viz** — Dashboard ist rein listenbasiert. Keine Sparklines, Trend-Charts, oder visuelle Daten.                                                                | **MODERATE** | `widget-dashboard.tsx`         |
| W-08 | **StatsCard `hover:-translate-y-0.5`** — Subtiler Lift-Effekt. Gut, aber nicht alle Cards nutzen das (Card.tsx hat keinen Lift). Inkonsistent.                             | **MINOR**    | `stats-card.tsx:53`            |

---

### 2.6 Accessibility (WCAG 2.2 AA)

#### Was gut ist

- Skip-to-Content Link ✓
- Global `focus-visible` Ring mit `outline: 2px solid var(--brand-primary)` ✓
- `aria-label` auf allen icon-only Buttons ✓
- `aria-current="page"` auf aktiven Nav-Items ✓
- `aria-expanded` / `aria-controls` auf Accordions ✓
- Focus-Trap auf Mobile Drawer ✓
- Keyboard-Navigation (ArrowUp/ArrowDown) in Sidebar ✓
- `prefers-reduced-motion` Support ✓
- `role="status"` / `aria-live="polite"` auf Brain-Status ✓
- `touch-action: manipulation` auf Mobile ✓
- `-webkit-overflow-scrolling: touch` ✓
- `overscroll-behavior: contain` ✓
- A11y-Baseline-Test-Infrastruktur mit 47 Dashboard-Routes ✓

#### Issues

| #    | Issue                                                                                                                                                                    | Severity     | Datei                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------ |
| A-01 | **Skip-Link Dark-Mode Kontrast** — `--brand-primary: #3b5c85` + weiß = ~4.8:1. Bestanden AA, aber knapp.                                                                 | **MINOR**    | `layout.tsx`                                                                                                                |
| A-02 | **Brain-Status-Dot color-only** — Grüner/roter/grauer Dot ohne Text-Alternative. Container hat `aria-label`, aber Dot selbst ist `aria-hidden`.                          | **MINOR**    | `page.tsx:96-99`                                                                                                            |
| A-03 | **Mobile Tab-Bar Active-Indicator `h-0.5`** — 2px Bar, schwer sehbar für Low-Vision.                                                                                     | **MINOR**    | `mobile-tab-bar.tsx:209`                                                                                                    |
| A-04 | **`text-amber-800` in Dark Mode** — Degraded-Warning-Banner. Nicht von Overrides erfasst. WCAG Fail.                                                                     | **SERIOUS**  | `widget-dashboard.tsx:602-603`                                                                                              |
| A-05 | **Collapsed Sidebar ohne Tooltips** — Icons ohne `title`-Attribut. Screen-Reader-Nutzer hören nur Icon-Name.                                                             | **MODERATE** | `sidebar.tsx`                                                                                                               |
| A-06 | **`inert`-Attribut** — Wird als `inert={!moreOpen                                                                                                                        |              | undefined}`verwendet.`inert`ist noch nicht in allen Browsern supported. Braucht Polyfill oder`aria-hidden`+`tabindex="-1"`. | **MODERATE** | `mobile-tab-bar.tsx:130` |
| A-07 | **Heading-Hierarchy** — `QueuePanel` nutzt `h2`, aber `QuickActions` nutzt auch `h2`. Innerhalb einer `section` sollte die Hierarchie tiefer gehen (`h3` für Sub-Items). | **MINOR**    | `widget-dashboard.tsx`                                                                                                      |
| A-08 | **`role="tablist"` auf Mobile Tab-Bar** — Tabs haben `role="tab"` aber das Container hat `role="tablist"` ohne `aria-orientation`.                                       | **MINOR**    | `mobile-tab-bar.tsx:206`                                                                                                    |
| A-09 | **Keine `lang`-Attribute auf gemischtsprachigen Inhalten** — "beA", "Copilot" etc. sind englisch in deutschem Kontext.                                                   | **MINOR**    | various                                                                                                                     |

---

### 2.7 AI-Generische Patterns (zu eliminieren)

| #     | Pattern                                                                          | Wo               | Referenz (wie es besser ist)                                                                    |
| ----- | -------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| AI-01 | **Left-Border Active Indicator** (`shadow-[inset_2px_0_0_var(--brand-primary)]`) | `sidebar.tsx` 4× | Notion: `bg-gray-100` + `font-semibold`. Linear: `bg-white/5` + `text-white`. Keine Border-Bar. |
| AI-02 | **Gradient-Text** (`.gradient-text`, `.gradient-text-animated`)                  | `globals.css`    | Im Dashboard nicht verwendet — gut. Marketing ok.                                               |
| AI-03 | **Orb-Blur-Animations** (`.orb`, `.orb-slow`)                                    | `globals.css`    | Im Dashboard nicht verwendet — gut.                                                             |
| AI-04 | **Standard 3-Column Layout** (Sidebar + Content + Copilot)                       | `layout.tsx`     | Layout ist ok, aber Visual-Treatment muss differenzierter werden.                               |
| AI-05 | **`animate-pulse` Skeletons**                                                    | `skeleton.tsx`   | Modern: Shimmer-Gradient statt Pulse.                                                           |
| AI-06 | **Generische Card-Shadows**                                                      | `globals.css`    | Modern: Border-only oder sehr subtile Layered-Shadows wie Vercel.                               |
| AI-07 | **`hover:-translate-y-0.5` auf Cards**                                           | `stats-card.tsx` | AI-Standard-Lift. Modern: nur Background/Border-Change, kein Lift.                              |
| AI-08 | **`active:scale-[0.98]` auf Buttons**                                            | `button.tsx`     | AI-Standard-Press. Modern: nur Background-Change, keine Scale.                                  |

---

### 2.8 Workflow-Haptik

| #    | Issue                                                                                                                         | Severity     | Datei                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------- |
| H-01 | **Keine Page-Transition-Animations** — Harte Schnitte. `widget-fade-in` existiert, wird aber nicht auf Page-Level angewendet. | **MODERATE** | `layout.tsx`         |
| H-02 | **Accordion-Animation 350ms** — Zu lang für Nav-Accordion. 200-250ms ist snappiger.                                           | **MINOR**    | `sidebar.tsx`        |
| H-03 | **Theme-Toggle = Hard Cut** — CSS-Transition auf allen Elementen, aber kein View-Transition-API.                              | **MINOR**    | `layout.tsx`         |
| H-04 | **Kein Haptic Feedback auf Mobile** — Tab-Bar-Taps ohne Vibration.                                                            | **MINOR**    | `mobile-tab-bar.tsx` |
| H-05 | **Skeleton = `animate-pulse`** — Kein Shimmer. Modern dashboards nutzen Shimmer-Gradient.                                     | **MINOR**    | `skeleton.tsx`       |
| H-06 | **Keine Optimistic Updates** — Bei Aktionen (z.B. Approve, Mark Read) kein Optimistic UI.                                     | **MODERATE** | various              |
| H-07 | **Keine Toast-Animations** — Toasts erscheinen ohne Slide-In/Fade-In.                                                         | **MINOR**    | `toast.tsx`          |
| H-08 | **Sidebar-Collapse 500ms** — Gut, aber Content-Reflow darunter nicht animiert.                                                | **MINOR**    | `sidebar.tsx`        |

---

### 2.9 Dark Mode Spezifisch

| #    | Issue                                                                                                  | Severity     | Datei                      |
| ---- | ------------------------------------------------------------------------------------------------------ | ------------ | -------------------------- |
| D-01 | **`--brand-primary: #3b5c85` zu entsättigt** — Kein visueller Akzent.                                  | **MODERATE** | `globals.css:936`          |
| D-02 | **`--ds-border: #2a303c` zu subtil** — Karten verschmelzen.                                            | **MODERATE** | `globals.css:933`          |
| D-03 | **`--ds-hover: #232834` zu subtil** — Hover-Feedback kaum sichtbar.                                    | **MINOR**    | `globals.css:934`          |
| D-04 | **`--brand-text` = Gold** — Inkonsistent mit Light Mode (Navy).                                        | **MODERATE** | `globals.css:945`          |
| D-05 | **Badge-Colors nicht theme-aware** — `emerald-700`, `amber-700`, `red-700` zu dunkel auf Dark Surface. | **SERIOUS**  | `badge.tsx`                |
| D-06 | **Degraded-Warning `text-amber-800`** — Nicht von Dark-Mode-Overrides erfasst.                         | **SERIOUS**  | `widget-dashboard.tsx:602` |

---

### 2.10 Light Mode Spezifisch

| #    | Issue                                                                                                                  | Severity    | Datei             |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------- |
| L-01 | **Button `danger` `text-red-400`** — Zu hell auf weiß. WCAG Fail.                                                      | **SERIOUS** | `button.tsx:19`   |
| L-02 | **Card-Shadows sehr subtil** — Fast unsichtbar. Gut für Minimalismus, aber Border muss kompensieren.                   | **MINOR**   | `globals.css`     |
| L-03 | **`--brand-primary: #1a365d`** — Sehr dunkles Navy. Gut für Legal, aber Akzent-Elemente (Links, Badges) wirken schwer. | **MINOR**   | `globals.css:865` |

---

## 3. Detaillierte Todo-Liste für Umstrukturierung

### Phase 1: AI-Generic Patterns eliminieren (BLOCKING)

- [ ] **TODO-001** — Entferne `shadow-[inset_2px_0_0_var(--brand-primary)]` aus allen 4 aktiven Sidebar-Items in `sidebar.tsx`. Ersetze durch: `brand-soft` Background (bereits vorhanden) + `font-semibold` (bereits vorhanden) + optional `ring-1 ring-inset ring-[color:var(--brand-primary)]/15` für subtilen Akzent. **Kein Left-Border.**
- [ ] **TODO-002** — Entferne `hover:-translate-y-0.5` aus `stats-card.tsx:53`. Ersetze durch: `hover:border-[color:var(--ds-border-strong)]` + `hover:card-shadow-hover` (bereits vorhanden).
- [ ] **TODO-003** — Entferne `active:scale-[0.98]` aus `button.tsx:13,21`. Ersetze durch: `active:bg-[color:var(--brand-primary)]` (minimal dunkler bei Press).
- [ ] **TODO-004** — Ersetze `animate-pulse` in `skeleton.tsx:11` durch Shimmer-Gradient-Animation (`shimmer` Keyframe in `globals.css` bereits definiert, aber nicht auf Skeleton angewendet).

### Phase 2: Color & Token Fixes (SERIOUS)

- [ ] **TODO-005** — Fix Button `danger` variant: Ersetze `text-red-400` durch `text-red-600 dark:text-red-400` oder theme-aware Token `text-[color:var(--ds-danger-text)]`.
- [ ] **TODO-006** — Mache Badge-Variants theme-aware: Ersetze rohe Tailwind-Colors durch CSS-Variablen. Definiere `--ds-success-text`, `--ds-success-bg`, `--ds-warning-text`, `--ds-warning-bg`, `--ds-danger-text`, `--ds-danger-bg`, `--ds-info-text`, `--ds-info-bg` in `globals.css` für beide Themes.
- [ ] **TODO-007** — Fix `text-amber-800` in `widget-dashboard.tsx:602-603`: Ersetze durch `text-[color:var(--ds-warning-text)]` oder `text-amber-700 dark:text-amber-400`.
- [ ] **TODO-008** — Dark Mode `--brand-primary` erhöhen: `#3b5c85` → `#5b8def` oder `#4a7bc8` (gesättigter, bleibt aber im blauen Spektrum). Teste Kontrast mit weißem Text.
- [ ] **TODO-009** — Dark Mode `--ds-border` erhöhen: `#2a303c` → `#303644` (leicht sichtbarer, Karten trennen sich).
- [ ] **TODO-010** — Dark Mode `--brand-text` = `--brand-primary` (nicht `--brand-secondary`). Gold nur für explizite Akzente, nicht für alle Brand-Texte.
- [ ] **TODO-011** — Definiere `--ds-danger-text`, `--ds-success-text`, `--ds-warning-text`, `--ds-info-text` Tokens in `globals.css` für beide Themes mit WCAG AA Kontrast.

### Phase 3: Sidebar & Navigation Redesign

- [ ] **TODO-012** — Reduziere Nav-Sektionen auf 4-5 Hauptsektionen: Cockpit, Akten, Kommunikation, Wissen, Verwaltung. Gruppiere Sub-Items unter diesen.
- [ ] **TODO-013** — Definiere explizite Section-Icons in `NAV_SECTIONS` (nicht abgeleitet vom ersten Item).
- [ ] **TODO-014** — Füge Badge-Counts zu Nav-Items hinzu: Fristen (kritische Anzahl), Inbox (ungelesene), Reviews (offene). Daten aus `useKanzleiCockpitData` oder separatem Hook.
- [ ] **TODO-015** — Füge `title`-Attribut zu allen Nav-Links hinzu (für Collapsed-State Tooltips): `title={t(item.labelKey)}`.
- [ ] **TODO-016** — User-Profile: Zeige Initialen (aus User-Name) statt generischem User-Icon.
- [ ] **TODO-017** — Dream-Cycle-Indicator: Reduziere auf ein kleines Icon mit Tooltip, kein ausklappbarer Block.
- [ ] **TODO-018** — Accordion-Animation-Dauer: 350ms → 220ms.
- [ ] **TODO-019** — Füge "Pinned Items" / "Favorites" Sektion am Top der Sidebar hinzu (optional, Power-User Feature).

### Phase 4: Topbar Polish

- [ ] **TODO-020** — Search-Bar: Reduziere Default-Breite auf `max-w-xs`, expandiere on focus mit `focus:w-full focus:max-w-md` Transition.
- [ ] **TODO-021** — Füge Breadcrumb oder Page-Title zur Topbar hinzu (rechts neben Search oder links davon).
- [ ] **TODO-022** — Theme-Toggle: Ersetze Button durch animierten Slide-Toggle (Sun ↔ Moon mit CSS-Transform).
- [ ] **TODO-023** — Icon-Größen systematisieren: Definiere `--icon-sm: 14px`, `--icon-md: 16px`, `--icon-lg: 20px`, `--icon-xl: 24px` und verwende konsistent.
- [ ] **TODO-024** — Notification "mark all read" Button: Verwende `--brand-text` statt `--brand-primary` für bessere Sichtbarkeit in Dark Mode.

### Phase 5: Dashboard Page & Widgets

- [ ] **TODO-025** — MetricRail: Erhöhe Zahlen von `text-2xl` auf `text-[2rem]` (konsistent mit StatsCard).
- [ ] **TODO-026** — QueuePanel-Title: `text-sm` → `text-[15px]` mit `font-semibold`.
- [ ] **TODO-027** — QueueRow Icon-Container: `h-8 w-8` → `h-9 w-9`.
- [ ] **TODO-028** — Empty States: Erweitere `EmptyLine` zu Icon + Text + optional CTA-Link.
- [ ] **TODO-029** — Loading-States für alle Panels: Zeige `RowSkeleton` wenn `data.loading` true.
- [ ] **TODO-030** — Page-Transition: Wende `widget-fade-in` auf Page-Level an (in `layout.tsx` oder `page.tsx` Container).
- [ ] **TODO-031** — Füge Sparklines oder Mini-Trend-Charts zu MetricRail hinzu (7-Tage-Trend für jede Metrik).
- [ ] **TODO-032** — Welcome-Banner: Subtiler Gradient-Background statt Border-Box.
- [ ] **TODO-033** — Card-Komponente: Füge `hover:-translate-y-0.5` NICHT hinzu (siehe TODO-002), aber `hover:card-shadow-hover` + `hover:border-strong` als Standard-Hover.

### Phase 6: Accessibility Fixes

- [ ] **TODO-034** — Collapsed Sidebar: Füge `title`-Attribut zu allen Links hinzu (TODO-015 deckt dies ab).
- [ ] **TODO-035** — Mobile Tab-Bar Active-Indicator: `h-0.5` → `h-1` (4px).
- [ ] **TODO-036** — `inert`-Attribut in `mobile-tab-bar.tsx:130`: Ersetze durch `aria-hidden={true}` + `tabindex={-1}` auf allen fokussierbaren Kindern, oder verwende `inert` Polyfill.
- [ ] **TODO-037** — Brain-Status-Dot: Füge `role="img"` + `aria-label` zum Dot hinzu (z.B. "Status: verbunden" / "Status: eingeschränkt").
- [ ] **TODO-038** — Heading-Hierarchy: `QueuePanel`-Title = `h2`, Sub-Items in `QuickActions` = `h3`.
- [ ] **TODO-039** — Mobile Tab-Bar: Füge `aria-orientation="horizontal"` zu `role="tablist"` hinzu.
- [ ] **TODO-040** — Skip-Link Dark-Mode: Verwende `--ds-text` (weiß) auf `--brand-primary` Background statt hardcoded `text-white`.

### Phase 7: Dark Mode Polish

- [ ] **TODO-041** — Nach TODO-008 (Brand-Primary Erhöhung): Teste alle `brand-text`, `brand-soft`, `brand-border` Elemente in Dark Mode auf Kontrast.
- [ ] **TODO-042** — Dark Mode `--ds-hover`: `#232834` → `#283040` (etwas sichtbarer).
- [ ] **TODO-043** — Füge Dark-Mode-spezifische Card-Hover-Shadow hinzu: Subtler Glow statt nur Shadow.
- [ ] **TODO-044** — Teste alle Badge-Variants in Dark Mode nach TODO-006 (theme-aware Tokens).
- [ ] **TODO-045** — Dark Mode Scrollbar: Thumb `--ds-border-strong: #3d4657` → `#454d60` (etwas sichtbarer).

### Phase 8: Workflow-Haptik

- [ ] **TODO-046** — Page-Transition: Füge `fade-in` Animation auf Page-Wechsel hinzu (Next.js `usePathname` als Dependency für Key-basierte Re-Animation).
- [ ] **TODO-047** — Skeleton: Shimmer-Gradient statt `animate-pulse` (TODO-004).
- [ ] **TODO-048** — Toast: Füge Slide-In/Fade-Out Animation hinzu.
- [ ] **TODO-049** — Theme-Toggle: View-Transition-API verwenden (falls unterstützt) für smooth Theme-Switch.
- [ ] **TODO-050** — Mobile: Füge `navigator.vibrate(10)` auf Tab-Bar-Taps hinzu (mit Feature-Detection).
- [ ] **TODO-051** — Sidebar-Collapse: Animiere Content-Reflow mit `transition-[padding]` auf Main-Content.

### Phase 9: Typography Polish

- [ ] **TODO-052** — Sidebar-Search: `text-[13px]` → `text-sm` (14px).
- [ ] **TODO-053** — Brain-Status: `text-[11px]` → `text-xs` (12px). Entity-Count: `text-[10px]` → `text-xs`.
- [ ] **TODO-054** — Font-Display: `display: swap` → `display: optional` für Dashboard-Fonts (vermeidet FOUT).
- [ ] **TODO-055** — Definiere Letter-Spacing-Scale: `--tracking-tight: -0.02em`, `--tracking-normal: 0`, `--tracking-wide: 0.025em`, `--tracking-wider: 0.05em`.
- [ ] **TODO-056** — QueuePanel-Title: Siehe TODO-026.

### Phase 10: Marketing → Dashboard Brand-Konsistenz

- [ ] **TODO-057** — Definiere eine Brand-Transition-Strategy: Entweder Dashboard an Marketing anpassen (Blau/Teal) oder Marketing an Dashboard (Navy/Gold) oder eine gemeinsame Palette definieren.
- [ ] **TODO-058** — Falls Navy/Gold beibehalten: Marketing-Site sollte Navy/Gold als Sekundärpalette übernehmen, damit der Übergang weniger hart ist.
- [ ] **TODO-059** — Falls Blau/Teal: Dashboard Brand-Primary auf `#2f6bff` (oder abgeleitete Dark-Variante) setzen.

---

## 4. Priorisierung & Reihenfolge

| Priorität         | Phase    | Todos            | Aufwand           |
| ----------------- | -------- | ---------------- | ----------------- |
| **P0 — BLOCKING** | Phase 1  | TODO-001 bis 004 | 2h                |
| **P0 — SERIOUS**  | Phase 2  | TODO-005 bis 011 | 4h                |
| **P1 — HIGH**     | Phase 3  | TODO-012 bis 019 | 8h                |
| **P1 — HIGH**     | Phase 6  | TODO-034 bis 040 | 3h                |
| **P2 — MEDIUM**   | Phase 4  | TODO-020 bis 024 | 4h                |
| **P2 — MEDIUM**   | Phase 5  | TODO-025 bis 033 | 6h                |
| **P2 — MEDIUM**   | Phase 7  | TODO-041 bis 045 | 3h                |
| **P3 — LOW**      | Phase 8  | TODO-046 bis 051 | 4h                |
| **P3 — LOW**      | Phase 9  | TODO-052 bis 056 | 2h                |
| **P3 — LOW**      | Phase 10 | TODO-057 bis 059 | 4h (Entscheidung) |

**Gesamtaufwand: ~40h**

---

## 5. Referenz-Designs (Non-AI-Generic)

| Dashboard  | Was übernehmen                                                                                | Was NICHT übernehmen                  |
| ---------- | --------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Notion** | Subtile Background-Tint für aktive Nav-Items. Minimalistische Card-Borders. Clean Typography. | Zu viel Weißraum für Daten-Dashboard. |
| **Linear** | `gap-px` Grid-Lines. Kompakte Density. Theme-Aware Badge-Colors. Shimmer-Skeletons.           | Zu dunkles Default-Theme.             |
| **Vercel** | Layered-Shadows. Subtle Hover-States (Border-Change, kein Lift). Clean Stat-Cards.            | Zu minimalistisch für Legal-Tech.     |
| **Stripe** | Data-Viz in Metrics. Breadcrumb in Topbar. Animated Theme-Toggle.                             | Zu viele Farben.                      |

---

## 6. Definition of Done

- [ ] Alle P0-Todos (Phase 1 + 2) implementiert und verifiziert
- [ ] Kein `shadow-[inset_2px_0_0_*]` mehr im Codebase
- [ ] Alle Badge/Button-Variants theme-aware (keine rohen Tailwind-Colors für semantische States)
- [ ] WCAG 2.2 AA Kontrast für alle Text/Background-Kombinationen in beiden Themes verifiziert
- [ ] Dark-Mode Brand-Primary visuell präsent (nicht ausgewaschen)
- [ ] Sidebar aktive Items: Background-Tint + bolder Text, KEIN Left-Border
- [ ] Skeletons nutzen Shimmer, nicht Pulse
- [ ] Cards: Hover = Border/Shadow-Change, kein Lift
- [ ] Buttons: Active = Background-Change, kein Scale
- [ ] A11y-Test-Suite (`a11y-baseline.ts`) läuft grün für alle 47 Dashboard-Routes
- [ ] Mobile Tab-Bar Active-Indicator ≥ 4px
- [ ] Alle Collapsed-Sidebar-Items haben `title`-Attribut
