# Subsumio Dashboard Frontend Audit Prompt

> **Zweck:** Dieser Prompt wird verwendet, um das Dashboard-Frontend (`/dashboard/*`) systematisch gegen State-of-the-Art-SaaS-Standards für Anwaltskanzleien zu auditieren. Er deckt Barrierefreiheit (WCAG 2.2 AA + BITV 2.0), UX/UI-Konsistenz, Navigation/Link-Integrität, Performance und funktionale Vollständigkeit ab.

---

## Audit-Kontext

**Produkt:** Subsumio — AI Legal Workspace für DACH-Anwaltskanzleien
**Bereich:** Auth-geschütztes Dashboard unter `/dashboard/*`
**Tech-Stack:** Next.js 15 (App Router), React 19, TailwindCSS, Lucide Icons, TanStack Query
**Zielgruppe:** Rechtsanwälte, Sachbearbeiter, Kanzleiverwaltung in DE/AT/CH
**Sprachen:** Deutsch (Primary), Englisch (Secondary)

### Architektur-Grundlagen

- Das Dashboard hat eine **eigene Layout-Shell** (`src/app/dashboard/layout.tsx`) mit Sidebar + Topbar + Command Palette
- Das Marketing-Layout (`MarketingShell` mit `MarketingNav`) wird **nicht** auf `/dashboard/*` gerendert — der Root-Layout trennt dies über `hasOwnMain` und `isMarketingPage`
- Middleware schützt alle `/dashboard/*`-Routen (Session-Check + CSRF-Cookie)
- Onboarding-Flow leitet neue Nutzer automatisch durch `/dashboard/onboarding`

---

## 1. Header-Isolation & Layout-Shell

### Anforderungen

- **Kein Marketing-Header** darf auf `/dashboard/*` sichtbar sein
- Dashboard hat eigene Topbar (Suche, Notifications, Theme, User-Menu, Brain-Selector)
- Sidebar mit Sektionen, Collapse, Mobile-Drawer, Filter
- Command Palette (⌘K) als globale Schnellnavigation
- Skip-to-Content Link für Keyboard-Nutzer

### Prüfpunkte

- [ ] `MarketingShell` wird nicht für `/dashboard/*` gerendert
- [ ] Kein Marketing-Nav, Footer oder Background auf Dashboard-Seiten
- [ ] Dashboard-Topbar ersetzt Marketing-Header vollständig
- [ ] Sidebar ist collapsible (Desktop) + Drawer (Mobile)
- [ ] Body-Scroll-Lock bei Mobile-Drawer und Command Palette aktiv
- [ ] Focus-Trap im Mobile-Drawer funktioniert (Tab/Shift+Tab)
- [ ] Skip-to-Content Link ist `sr-only` bis auf Focus, springt zu `#main-content`

---

## 2. Barrierefreiheit (WCAG 2.2 AA / BITV 2.0)

### 2.1 Tastatur-Navigation

- [ ] Alle interaktiven Elemente sind mit Tab erreichbar
- [ ] Sichtbarer Focus-Indicator auf allen Elementen (`focus-visible:ring-2`)
- [ ] Logische Tab-Reihenfolge (Sidebar → Topbar → Content)
- [ ] Arrow-Key-Navigation in Sidebar (implementiert: ArrowUp/Down)
- [ ] Arrow-Key-Navigation in Command Palette (implementiert: ArrowUp/Down + Enter + Escape)
- [ ] Arrow-Key-Navigation in Topbar-Dropdowns (Notifications, Brain-Selector, Search)
- [ ] Escape schließt alle Overlays (Dropdowns, Command Palette, Mobile Drawer)

### 2.2 ARIA & Semantik

- [ ] `<nav>` hat `aria-label` ("Hauptnavigation")
- [ ] `<main>` hat `id="main-content"` und `role="main"`
- [ ] Aktive Nav-Items haben `aria-current="page"`
- [ ] Buttons haben aussagekräftige `aria-label` (besonders Icon-Only-Buttons)
- [ ] Dropdowns haben `aria-expanded`, `aria-haspopup`
- [ ] Live-Regionen für Status-Updates (`aria-live="polite"`)
- [ ] Notification-Badge hat `aria-hidden` (rein dekorativ)
- [ ] Skip-Link hat sichtbaren Focus-State
- [ ] Settings-Tabs haben `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`
- [ ] Notification-Items sind fokussierbar (aktuell `<div>`, nicht `<button>`/`<a>`)
- [ ] Suchergebnisse in Topbar haben `role="listbox"` + `role="option"` (implementiert)

### 2.3 Kontrast & Lesbarkeit

- [ ] Text-Kontrast ≥ 4.5:1 (Normaltext) bzw. ≥ 3:1 (Großtext)
- [ ] Non-Text-Kontrast ≥ 3:1 (UI-Komponenten, Icons)
- [ ] Dark-Mode-Kontrast erfüllt dieselben Standards
- [ ] Placeholder-Text hat ausreichenden Kontrast (≥ 3:1)
- [ ] Brand-Farben auf Hover/Active bleiben kontrastreich

### 2.4 Responsivität & Touch

- [ ] Touch-Targets ≥ 44×44px (WCAG 2.5.5 / 2.5.8)
- [ ] Mobile-Layout: Sidebar als Drawer, Topbar kompakt
- [ ] Kein horizontaler Scroll auf Mobile (320px+)
- [ ] Tables haben `hideOnMobile`-Spalten wo sinnvoll
- [ ] Mobile-Suche über Command-Palette zugänglich

### 2.5 Reduzierte Bewegung

- [ ] `prefers-reduced-motion` wird respektiert
- [ ] Animationen haben reduzierte/keine Bewegung bei Setting
- [ ] Loading-Spinner sind erlaubt (keine Motion-Sickness)

---

## 3. Navigation & Link-Integrität

### 3.1 Sidebar-Struktur

**Sektionen:** Gehirn · Akten & Fristen · Recherche · Schriftsätze & Abrechnung · Daten & Integration · Branchen · Verwaltung (Bottom)

- [ ] Jeder Sidebar-Link führt zu einer existierenden Route (`/dashboard/*`)
- [ ] Keine 404s auf Sidebar-Links
- [ ] `comingSoon`-Items sind als `disabled` markiert mit Badge "bald"
- [ ] Keine doppelten Label-Keys (z.B. `nav.vault` für Playbooks UND Vault)
- [ ] Alle Label-Keys sind in `dashboard.ts` definiert (keine fehlenden Keys)
- [ ] Aktive Route wird korrekt gehighlight (`pathname === item.href` oder `startsWith`)
- [ ] Sidebar-Filter funktioniert für alle Items

### 3.2 Command Palette

- [ ] Alle Sidebar-Items sind in der Command Palette vertreten
- [ ] Keine fehlenden Routes in Command Palette
- [ ] Recent-Items werden gespeichert und angezeigt
- [ ] Aktionen (Theme, Sidebar, Refresh) funktionieren
- [ ] Hilfe-Items (Doku, Shortcuts, Support) sind verlinkt

### 3.3 Querverweise

- [ ] Dashboard-Widgets linken korrekt (Upload, Query, Brain, Graph)
- [ ] Deadlines linken zur jeweiligen Akte
- [ ] Getting-Started-Links funktionieren
- [ ] User-Menu → Settings funktioniert
- [ ] Breadcrumbs auf Subpages vorhanden und korrekt
- [ ] Keine `<a href>` für interne Routes (sollten `<Link>` verwenden)

### 3.4 Route-Vollständigkeit

Folgende Routes müssen existieren und funktional sein:

- `/dashboard` (Übersicht)
- `/dashboard/assistant` (AI-Assistant)
- `/dashboard/query` (Brain-Query)
- `/dashboard/agents` (Agenten)
- `/dashboard/approvals` (Freigaben)
- `/dashboard/workflows` (Workflows)
- `/dashboard/brain` (Brain-Explorer)
- `/dashboard/graph` (Knowledge-Graph)
- `/dashboard/upload` (Upload)
- `/dashboard/rag-eval` (RAG-Evaluation)
- `/dashboard/cases` + `/dashboard/cases/new` + `/dashboard/cases/[slug]`
- `/dashboard/contacts`
- `/dashboard/contracts`
- `/dashboard/playbooks`
- `/dashboard/vault`
- `/dashboard/deadlines`
- `/dashboard/opponents`
- `/dashboard/client-portal`
- `/dashboard/research`
- `/dashboard/analyze`
- `/dashboard/precedent-search`
- `/dashboard/translate`
- `/dashboard/rechtsprechung`
- `/dashboard/norms`
- `/dashboard/judgements-sync`
- `/dashboard/kollisionspruefung`
- `/dashboard/tabular-review`
- `/dashboard/obligation-tracking`
- `/dashboard/case-scanner`
- `/dashboard/clause-library`
- `/dashboard/review-queue`
- `/dashboard/version-history`
- `/dashboard/monitoring`
- `/dashboard/sources`
- `/dashboard/drafting`
- `/dashboard/cost-calculator`
- `/dashboard/invoicing`
- `/dashboard/datev-export`
- `/dashboard/signature`
- `/dashboard/connectors`
- `/dashboard/whatsapp`
- `/dashboard/intake`
- `/dashboard/document-requests`
- `/dashboard/import-kanzlei`
- `/dashboard/bea`
- `/dashboard/email-import`
- `/dashboard/calendar-export`
- `/dashboard/compliance` + `/dashboard/compliance/retention`
- `/dashboard/anonymize`
- `/dashboard/word-addin`
- `/dashboard/verfahrensdoku`
- `/dashboard/data-export`
- `/dashboard/team`
- `/dashboard/controlling`
- `/dashboard/audit`
- `/dashboard/api-keys`
- `/dashboard/billing`
- `/dashboard/mobile`
- `/dashboard/settings` + Subpages (`/ai-model`, `/kanzlei`, `/security`, `/scim`)
- `/dashboard/onboarding`

---

## 4. UX/UI-Konsistenz (State of the Art)

### 4.1 Design-System

- [ ] Konsistente Verwendung von CSS-Variablen (`--ds-*`, `--brand-*`)
- [ ] Keine hardcoded Farben außerhalb des Design-Systems
- [ ] Konsistente Border-Radius (Cards: `rounded-xl`, Buttons: `rounded-lg`)
- [ ] Konsistente Spacing-Skala (Tailwind-Klassen)
- [ ] Konsistente Typography (Inter für Body, Space Grotesk für Display)

### 4.2 Loading & Error States

- [ ] Jede Seite hat Loading-State (Skeleton oder Spinner)
- [ ] Jede Seite hat Error-State mit Retry-Button
- [ ] Jede Seite hat Empty-State mit Action-Button
- [ ] Dashboard-Loading ist zentriert mit Spinner
- [ ] Dashboard-Error hat Sentry-Reporting + Retry

### 4.3 i18n-Konsistenz

- [ ] Alle UI-Strings verwenden `useLang()` + `D`-Keys
- [ ] Keine hardcoded deutschen Strings in Komponenten
- [ ] Command Palette verwendet i18n (aktuell hardcoded DE)
- [ ] Widget-Dashboard verwendet i18n (aktuell hardcoded DE)
- [ ] Error/Loading-Pages verwenden i18n (aktuell hardcoded DE)
- [ ] Topbar-Search-Results verwenden i18n (aktuell hardcoded DE)

### 4.4 Performance

- [ ] Client-Side Navigation (keine Full-Page-Reloads)
- [ ] `<Link>` statt `<a href>` für interne Routes
- [ ] Debounced Search (300ms implementiert)
- [ ] Lazy-Loading wo sinnvoll
- [ ] Keine unnötigen Re-Renders

### 4.5 Anwaltskanzlei-Spezifika

- [ ] Fristen-Widget prominent platziert
- [ ] Akten-Schnellzugriff sichtbar
- [ ] Brain-Status klar indikiert
- [ | RVG/RATG-Tarifmodelle in Settings
- [ ] DATEV-Export-Kontenrahmen (SKR03/SKR04/SKR49)
- [ ] DACH-spezifische Fristenberechnung
- [ ] beA-Integration sichtbar
- [ ] Kanzlei-Profil (Name, Kammer, USt-Id) in Settings

---

## 5. Edge Cases & Stress-Tests

- [ ] Leeres Brain (0 Pages, 0 Entities) → Welcome-Banner + Getting-Started
- [ ] Engine offline → Offline-Badge + Error-State mit Retry
- [ ] Sehr viele Akten (>200) → Pagination (pageSize=20)
- [ ] Sehr lange Akten-Titel → Truncate mit Tooltip
- [ ] Sidebar-Collapse + Mobile → Korrekte Darstellung
- [ ] Theme-Switch → Kein FOUC, korrekte Persistenz
- [ ] ⌘K öffnet Command Palette, ESC schließt
- [ ] Onboarding-Redirect bei nicht-abgeschlossenem Onboarding
- [ ] Onboarding-Skip funktioniert
- [ ] Session-Ablauf → Redirect zu `/login?next=/dashboard`

---

## 6. Benchmark: Best-of-Class SaaS Dashboards

Vergleichs-Anbieter: Notion, Linear, Clio, MyLaw, Litera, Relativity

- [ ] Sidebar-Collapse mit Icon-Only-Mode (wie Linear)
- [ ] Command Palette mit Recent + Search (wie Linear/Notion)
- [ ] Widget-Customization mit Drag-and-Drop (wie Notion)
- [ ] Inline-Notifications mit Badge (wie Linear)
- [ ] Dark/Light-Theme ohne Flash (wie Linear)
- [ ] Keyboard-First Navigation (wie Linear)
- [ ] Contextual Empty States (wie Clio)
- [ ] Breadcrumb-Navigation auf Subpages (wie Clio)

---

## Audit-Ergebnis-Format

Für jeden Prüfpunkt:

- ✅ Bestanden
- ❌ Fehlgeschlagen (mit Beschreibung + Datei:Zeile)
- ⚠️ Teilweise (mit Beschreibung was fehlt)

Am Ende: Priorisierte TODO-Liste mit:

- **P0 (Critical):** Barrierefreiheit, Broken Links, i18n-Verstöße
- **P1 (High):** UX-Inkonsistenzen, Missing Features
- **P2 (Medium):** Polish, Performance
- **P3 (Low):** Nice-to-have
