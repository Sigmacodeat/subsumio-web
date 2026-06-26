# Legal AI OS — Redesign Blueprint

> **Status:** Draft — 2026-06-26  
> **Ziel:** Transformation vom klassischen Dashboard zu einem AI-native Legal Workspace  
> **Referenzen:** Untitled UI (Design-System), Linear (Density), Attio (AI-Native), Mercury (Trust), Lazarev eDiscovery (Legal-Tech IA)

---

## 1. Ziel des Systems (User-Sicht)

**Heute:** Der Anwalt öffnet ein Dashboard, sieht Metriken und muss selbst navigieren.  
**Ziel:** Der Anwalt öffnet seinen Workspace, wird persönlich begrüßt, die KI sagt ihm was wichtig ist, und er kann direkt handeln — per KI-Chat oder Quick-Action.

Das System fühlt sich an wie **Linear + OpenAI ChatGPT Team + Notion**, nicht wie ein Admin-Template.

---

## 2. Kern-Userflows

### Beginner (Erstkontakt)
1. Login → Onboarding (bestehend)
2. Workspace öffnet sich → AI-Copilot begrüßt: "Guten Morgen, [Name]. Ich habe 3 Fristen und 2 neue beA-Nachrichten gefunden. Womit möchtest du beginnen?"
3. Klick auf eine Quick-Action → direkt zur richtigen Seite
4. Copilot bleibt als Seitenpanel sichtbar

### Normal (Tägliche Nutzung)
1. Workspace öffnet → AI-Priorisierung oben: kritische Fristen, offene Freigaben
2. "Meine Mandate" Liste → Klick auf Akte → Akten-Detail
3. Copilot rechts mit kontextuellen Quick-Actions für die aktuelle Akte
4. ⌘K für Command Palette → Navigation ohne Maus

### Power-User
1. ⌘J öffnet Copilot direkt → "Fasse Akte Müller-Insolvenz zusammen" → KI antwortet mit Citations
2. ⌘K → "Frist eintragen" → Form-Dialog ohne Seitenwechsel
3. Keyboard-Only Navigation durch alle Sektionen
4. KI-Agenten-Status live: "Vertragsanalyse: 3 fertig, 1 läuft"

---

## 3. Layout-Konzept: AI Workspace

```
┌─────────────────────────────────────────────────────────────────────┐
│ Topbar: Logo · Search · Notifications · Theme · User               │
├──────────┬──────────────────────────────────────┬───────────────────┤
│          │                                      │                   │
│ Sidebar  │  Main Content                        │  Copilot Panel    │
│ (220px)  │                                      │  (380px, toggle)  │
│          │  ┌──────────────────────────────┐    │                   │
│ ───────  │  │ AI Greeting + Copilot Bar    │    │  Context header   │
│ Overview │  │ "Guten Morgen, Ismet."       │    │  Proactive alerts │
│ Cases    │  │ [Welche Aufgabe…?] [↑]       │    │  Quick actions    │
│ Deadlines│  └──────────────────────────────┘    │  Chat panel       │
│ Intake   │                                      │                   │
│ Chat     │  ┌──────────────────────────────┐    │                   │
│ ───────  │  │ Fristen-Hero                 │    │                   │
│ Cases &  │  │ 3 kritisch · 1 überfällig    │    │                   │
│ Clients  │  └──────────────────────────────┘    │                   │
│ Comm.    │                                      │                   │
│ Docs      │  ┌──────────────────────────────┐   │                   │
│ Research │  │ Meine Mandate (List)         │    │                   │
│ Ops      │  │ ● Müller GmbH    · aktiv     │    │                   │
│ Billing  │  │ ● Schneider AG   · wartend   │    │                   │
│ ───────  │  │ ● Insolvenz ...   · dringend │    │                   │
│ Settings │  └──────────────────────────────┘    │                   │
│ Team     │                                      │                   │
│ Audit    │  ┌──────────────────────────────┐    │                   │
│          │  │ KI-Agenten (Live Status)     │    │                   │
│          │  │ ✓ Vertragsanalyse  3/4       │    │                   │
│          │  │ ⟳ Fristen-Scan     läuft     │    │                   │
│          │  │ ✓ Recherche        fertig    │    │                   │
│          │  └──────────────────────────────┘    │                   │
│          │                                      │                   │
│          │  ┌──────────────────────────────┐    │                   │
│          │  │ Kanzlei-Insights (sekundär)  │    │                   │
│          │  └──────────────────────────────┘    │                   │
└──────────┴──────────────────────────────────────┴───────────────────┘
```

### Vertikale Reihenfolge (Main Content)
1. **AI Greeting + Copilot Bar** — Personalisierte Begrüßung + Inline-Chat-Eingabe (nicht nur Sidebar)
2. **Fristen-Hero** — Behalten! "North Star" Metrik, aber visuell verfeinert (Mercury-Style)
3. **Quick Actions Grid** — 7 Aktionen als kompakte Tiles (bestehend, aber visuell upgraden)
4. **Meine Mandate** — Liste mit Status-Indikatoren (Linear-Style), nicht Card-Grid
5. **KI-Agenten** — Live-Status statt Checkliste (Attio-Style)
6. **Secondary Stats** — 4 kompakte Metriken (bestehend, aber schmaler)
7. **Inbox + Deadlines Listen** — Side-by-side (bestehend, aber Linear-Density)
8. **Kanzlei-Insights** — Ganz unten, sekundär (Tremor Charts)

---

## 4. Design-Token-Anpassungen (Untitled UI Alignment)

### Was sich ändert in `globals.css`

| Token | Heute | Ziel | Begründung |
|---|---|---|---|
| `--ds-radius-sm` | 8px | 6px | Untitled UI: schärfere Inputs |
| `--ds-radius-md` | 12px | 10px | Untitled UI: präzisere Cards |
| `--ds-space-4` | 16px | 16px | ✓ bleibt |
| Sidebar width | 256px | 220px | Linear: kompakter, mehr Content |
| `--ds-text-sm` | 14px | 13px | Linear-Density: mehr Zeilen pro Panel |
| Card padding | 24px | 20px | Untitled UI: dichter, weniger Whitespace-Verschwendung |
| Row padding | 12px (py-3) | 10px (py-2.5) | Linear: mehr Items pro Screen |

### Neue Tokens

```css
/* Untitled UI — Premium Surface Tokens */
--ds-surface-elevated: /* für Modals, Popovers — 1 Stufe über --ds-surface */
--ds-focus-ring: /* 2px solid var(--brand-primary) mit 0.5 offset */
--ds-transition-tap: 120ms cubic-bezier(0.22, 1, 0.36, 1); /* schneller als current 150ms */

/* AI Workspace Tokens */
--ai-greeting-size: 1.875rem; /* 30px — persönliche Begrüßung, nicht H1 */
--ai-hero-number: 4.5rem; /* 72px — Mercury-Style North Star */
--ai-agent-dot: 6px; /* Live-Status-Indikator */
```

---

## 5. Komponenten-Änderungen

### 5.1 `widget-dashboard.tsx` → `workspace-dashboard.tsx`

**Neue Komponenten:**

| Komponente | Status | Was sich ändert |
|---|---|---|
| `AIGreeting` | **Neu** | Personalisierte Begrüßung + Inline-Copilot-Eingabe (nicht Sidebar, sondern Main Content Top) |
| `CockpitHero` | **Redesign** | Mercury-Style: `text-7xl` Hero-Number, Gradient-Background, KI-Summary-Zeile |
| `QuickActions` | **Redesign** | Kompaktere Tiles, `h-11` statt `h-12`, Icon-Tiles `h-6 w-6` |
| `MandateList` | **Neu** (ersetzt `ActiveCasesList`) | Linear-Style Liste mit Status-Dot, KI-Summary-Zeile, Pin-Funktion |
| `AgentStatus` | **Neu** | Live-Status der KI-Agenten: "Vertragsanalyse: 3/4 fertig" mit Progress-Bar |
| `SecondaryStats` | **Redesign** | Eine große North-Star + 3 kleine (Mercury-Hierarchie) |
| `DeadlineList` | **Redesign** | `py-2.5` statt `py-3`, Icon-Tile `h-7 w-7`, KI-Summary-Zeile |
| `InboxList` | **Redesign** | Gleiche Density-Anpassung wie DeadlineList |
| `PinnedMatters` | **Redesign** | Schmalere Pills, `text-xs` statt `text-sm` |

**`AIGreeting` Spezifikation:**
```
┌────────────────────────────────────────────────────────────────┐
│  Guten Morgen, Ismet.                              26. Juni    │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ✨  Welche Aufgabe möchtest du erledigen?          [↑] │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  KI-Priorisierung: 3 dringende Fristen · 2 unbeantwortete beA  │
└────────────────────────────────────────────────────────────────┘
```
- Input fokussiert auf ⌘E oder Klick → sendet an Copilot-Chat
- Enter öffnet Copilot-Sidebar mit der Frage
- KI-Priorisierung als klickbare Links → jeweilige Seite

**`AgentStatus` Spezifikation:**
```
┌──────────────────────────────────────────────────────────┐
│  KI-Agenten                                    [Alle ansehen] │
│                                                            │
│  ● Vertragsanalyse        3/4 fertig    ████████░░  75%    │
│  ● Fristen-Überwachung    läuft         ░░░░░░░░░░  ...     │
│  ● Schriftsatz-Erstellung fertig        ██████████  100%   │
│  ● Rechtsprechung-Recherche fertig      ██████████  100%   │
│  ● Mandantenkommunikation 2/3           ███████░░░  67%    │
│  ● Dokumentenzusammenfassung 5/5        ██████████  100%   │
└──────────────────────────────────────────────────────────┘
```
- Daten aus `agent_action` Pages (bestehende Query)
- Klick auf Agent → `/dashboard/agents` mit Filter
- Progress-Bar mit `--brand-primary` Fill

### 5.2 `sidebar.tsx` — Density + Lazarev 2-Tier

**Änderungen:**
- Width: 256px → 220px (collapsed: 64px bleibt)
- Font: `text-sm` → `text-[13px]` für Nav-Items
- Section Headers: `text-xs` → `text-[11px]` uppercase tracking-wider
- Active Item: 3px left-border → 2px left-border + subtle background tint
- Icon size: 16px → 15px
- Row padding: `py-2` → `py-1.5` für mehr Items pro Screen

**Lazarev 2-Tier Filter (optional, Phase 2):**
- Unter "Akten & Mandate" → collapsible Sub-Filter: Rechtsgebiet, Status, Mandant
- Unter "Kommunikation" → Sub-Filter: beA, WhatsApp, Email
- Implementiert als collapsible `<div>` unter Section Header

### 5.3 `topbar.tsx` — Minimaler Redesign

**Änderungen:**
- Höhe: `h-14` → `h-12` (kompakter)
- Search bar: breiter, `max-w-md` → `max-w-lg`
- Brain-Selector: schmaler, nur Icon + Name (nicht vollständige URL)
- Notifications: Bell-Icon mit Badge-Counter (bestehend)
- Theme-Toggle: bleibt
- User-Menu: Avatar + Name (nicht Email)

### 5.4 `copilot-sidebar.tsx` — Behalten mit Mini-Optimierungen

**Was bleibt:**
- Route-Context Detection (bestehend, gut)
- Quick Actions (bestehend, gut)
- Proactive Alerts (bestehend, gut)
- Resize-Handle (bestehend, gut)

**Was sich ändert:**
- Width: 380px → 360px (etwas schmaler, mehr Main Content)
- Header: `text-[13px]` → `text-xs` (kompakter)
- Quick Action Tiles: `text-xs` → `text-[11px]` (dichter)

### 5.5 Neue UI-Primitives

**`ui/progress.tsx` (neu):**
- Linear-Style Progress-Bar: 4px hoch, `--brand-primary` fill, rounded-full
- Für AgentStatus und Loading-States

**`ui/tooltip.tsx` (prüfen ob vorhanden):**
- Untitled UI Style: dark bg, `text-xs`, 4px padding, 200ms delay

**`data-table.tsx` → TanStack Table Migration (Phase 2):**
- Bestehende `DataTable` ist handwritten mit eigenem Sort/Paginate
- Migration zu `@tanstack/react-table` für: Column-Pinning, Column-Visibility, Row-Selection, Virtualisation
- API bleibt gleich (`Column<T>` Interface), nur Internals ändern sich

---

## 6. Datenmodell & State-Management

### Bestehend (bleibt)
- `useBrainStats()` — Kanzlei-Metriken
- `usePages({ type })` — Akten, Fristen, Rechnungen, etc.
- `useRecentMatters()` — Pinned/Recent Cases
- `useRecentQueries()` — Letzte KI-Anfragen
- `useMutationQueue()` — Offline-Sync
- `useNetworkStatus()` — Online/Offline

### Neu
- `useAgentStatus()` — Aggregiert `agent_action` Pages nach Typ → Live-Status + Progress
- `useAI prioritization()` — Ruft `/api/notifications?unread=true` auf (bestehend im Copilot) → aber als Main-Content Hook, nicht nur Sidebar
- `useWorkspaceGreeting()` — Zeitbasierte Begrüßung + User-Name aus `useMe()`

### State (Zustand)
- `copilotOpen` — bestehend in `layout.tsx`
- `collapsed` (Sidebar) — bestehend
- `theme` — bestehend
- **Neu:** `aiGreetingDismissed` — einmal pro Session, in `sessionStorage`

---

## 7. Architektur-Entscheidungen

### 7.1 AI Greeting als Main-Content, nicht als Sidebar
**Entscheidung:** Die Begrüßung + Inline-Chat-Eingabe ist im Main Content Bereich, nicht im Copilot-Sidebar.  
**Begründung:** Der Copilot-Sidebar ist kontextuell (ändert sich pro Route). Die Begrüßung ist der Entry-Point für die Workspace-Startseite (`/dashboard`). Sie ist das, was der Anwalt zuerst sieht.  
**Implementierung:** `AIGreeting` in `workspace-dashboard.tsx`, Input sendet an `CopilotSidebar` via `chatRef.current?.sendMessage()` (bestehendes imperative API).

### 7.2 Fristen-Hero bleibt, aber unter AI Greeting
**Entscheidung:** `CockpitHero` bleibt erhalten, rutscht aber unter die AI-Greeting-Sektion.  
**Begründung:** Fristen sind das #1 Risiko für Anwälte. Die KI-Begrüßung ist der Entry, aber Fristen müssen sofort sichtbar sein.  
**Implementierung:** Vertikale Reihenfolge: AIGreeting → CockpitHero → QuickActions → MandateList → ...

### 7.3 TanStack Table als Phase 2
**Entscheidung:** TanStack Table wird installiert, aber die Migration der bestehenden `DataTable` ist Phase 2.  
**Begründung:** Die bestehende `DataTable` funktioniert. Das Redesign ist visuell, nicht strukturell. TanStack Table bringt Column-Pinning und Virtualisation für große Listen — wichtig, aber nicht Day-1.  
**Implementierung:** `bun add @tanstack/react-table` in Phase 1, Migration in Phase 2.

### 7.4 Tremor für Charts als Phase 2
**Entscheidung:** Tremor wird installiert für Kanzlei-Insights, aber die bestehenden SVG-Charts bleiben vorerst.  
**Begründung:** Kanzlei-Insights sind sekundär (ganz unten im Layout). Die SVG-Charts funktionieren. Tremor bringt interaktive Charts (hover, tooltip) — nice-to-have, nicht critical.  
**Implementierung:** `bun add @tremor/react` in Phase 1, Integration in Phase 2.

### 7.5 Untitled UI Tokens als CSS-Variable-Overlay
**Entscheidung:** Untitled UI Design-Tokens werden als zusätzliche CSS-Variablen in `globals.css` übernommen, nicht als separates System.  
**Begründung:** Das bestehende Token-System ist sophisticated (dark/light, marketing/dashboard, WCAG-AA verified). Untitled UI Tokens ergänzen (Radius, Spacing), ersetzen nicht.  
**Implementierung:** Neue `--uu-*` Tokens in `@theme inline` für Untitled UI-spezifische Werte, die `--ds-*` Tokens werden angepasst.

---

## 8. Edge-Cases & Fehlerszenarien

| Szenario | Verhalten |
|---|---|
| **Erstnutzer (keine Akten, keine Fristen)** | AI-Greeting: "Willkommen! Lass uns deine erste Akte anlegen." + Quick-Action "Neue Akte" hervorgehoben. Kein Fristen-Hero, keine Mandate-Liste. |
| **Engine offline** | AI-Greeting: "Ich bin aktuell offline. Du kannst trotzdem Akten bearbeiten — ich synchronisiere später." + Offline-Badge. CockpitHero zeigt "—" statt Zahlen. |
| **100+ Akten** | MandateList: virtuelle Liste (Phase 2 mit TanStack Virtual) — Phase 1: `slice(0, 10)` + "Alle ansehen" Link |
| **Keine KI-Agenten aktiv** | AgentStatus: "Keine Agenten aktiv. Starte einen Workflow um KI-Aufgaben zu delegieren." + Link zu `/dashboard/workflows` |
| **Mobile (< 768px)** | AI-Greeting: kompakt (kein Datum, kleinere Schrift), Copilot als Bottom-Sheet, MandateList als Cards statt Liste |
| **Dark Mode** | Alle neuen Komponenten nutzen `--ds-*` Tokens → automatisches Dark Mode |
| **Reduce Motion** | `AIGreeting` ohne Fade-In, `AgentStatus` ohne Progress-Animation |

---

## 9. Arbeitspakete (Task Breakdown)

### Phase 1: Visual Foundation (Tag 1-2)

| Paket | Ziel | Dateien | Aufwand |
|---|---|---|---|
| **P1.1 Token-Update** | Untitled UI Tokens in globals.css | `globals.css` | 1h |
| **P1.2 Sidebar Density** | Width 220px, Font 13px, Row padding | `sidebar.tsx` | 2h |
| **P1.3 Topbar Compact** | Höhe h-12, Search breiter | `topbar.tsx` | 1h |
| **P1.4 UI Primitives** | `progress.tsx`, Tooltip-Check | `ui/progress.tsx` | 1h |
| **P1.5 Dependencies** | TanStack Table + Tremor installieren | `package.json` | 0.5h |

### Phase 2: AI Workspace Surface (Tag 2-3)

| Paket | Ziel | Dateien | Aufwand |
|---|---|---|---|
| **P2.1 AIGreeting** | Neue Komponente: Begrüßung + Inline-Chat | `workspace-dashboard.tsx` (neu) | 3h |
| **P2.2 CockpitHero Redesign** | Mercury-Style Hero-Number, Gradient | `widget-dashboard.tsx` | 2h |
| **P2.3 MandateList** | Linear-Style Liste mit Status-Dots | `widget-dashboard.tsx` | 2h |
| **P2.4 AgentStatus** | Live-Status der KI-Agenten | `widget-dashboard.tsx` | 2h |
| **P2.5 QuickActions Redesign** | Kompaktere Tiles | `widget-dashboard.tsx` | 1h |
| **P2.6 SecondaryStats Redesign** | Mercury-Hierarchie (1 groß + 3 klein) | `widget-dashboard.tsx` | 1h |

### Phase 3: Density & Polish (Tag 3-4)

| Paket | Ziel | Dateien | Aufwand |
|---|---|---|---|
| **P3.1 QueueRow Density** | py-2.5, Icon h-7 w-7, KI-Summary-Zeile | `widget-dashboard.tsx` | 2h |
| **P3.2 PinnedMatters Redesign** | Schmalere Pills | `widget-dashboard.tsx` | 1h |
| **P3.3 Copilot Sidebar Polish** | Width 360px, kompaktere Header | `copilot-sidebar.tsx` | 1h |
| **P3.4 Empty States** | Warm + actionable (bestehend, aber prüfen) | `widget-dashboard.tsx` | 1h |
| **P3.5 Mobile Layout** | AI-Greeting kompakt, MandateList als Cards | `workspace-dashboard.tsx` | 2h |

### Phase 4: TanStack Table Migration (Tag 4-5)

| Paket | Ziel | Dateien | Aufwand |
|---|---|---|---|
| **P4.1 DataTable Migration** | Internals zu TanStack Table, API bleibt | `data-table.tsx` | 4h |
| **P4.2 Column-Pinning** | Erste Spalte pinbar (z.B. Aktenname) | `data-table.tsx` | 1h |
| **P4.3 Virtualisation** | Virtuelle Liste für 100+ Rows | `data-table.tsx` | 2h |

### Phase 5: Tremor Charts (Tag 5)

| Paket | Ziel | Dateien | Aufwand |
|---|---|---|---|
| **P5.1 Kanzlei-Insights** | Tremor Charts für Umsatz, Auslastung | `workspace-dashboard.tsx` | 3h |
| **P5.2 Chart Theme** | Tremor an --ds-* Tokens anpassen | `globals.css` | 1h |

---

## 10. Definition of Done

### Phase 1 ✅ wenn:
- [ ] Sidebar ist 220px breit, Font ist 13px
- [ ] Topbar ist h-12 hoch
- [ ] `progress.tsx` existiert und ist getestet
- [ ] `@tanstack/react-table` und `@tremor/react` in `package.json`

### Phase 2 ✅ wenn:
- [ ] `AIGreeting` zeigt "Guten Morgen, [Name]" + Inline-Chat-Eingabe
- [ ] Enter im AIGreeting-Input öffnet Copilot mit der Frage
- [ ] `CockpitHero` zeigt Hero-Number in `text-7xl` mit Gradient-Background
- [ ] `MandateList` zeigt Akten mit Status-Dots (aktiv/wartend/dringend)
- [ ] `AgentStatus` zeigt Live-Progress-Bars für jede Agent-Kategorie
- [ ] `SecondaryStats` zeigt 1 große + 3 kleine Metriken

### Phase 3 ✅ wenn:
- [ ] QueueRows haben `py-2.5` und `h-7 w-7` Icon-Tiles
- [ ] Jede QueueRow hat eine KI-Summary-Zeile (truncate)
- [ ] Copilot-Sidebar ist 360px breit
- [ ] Mobile Layout funktioniert (AI-Greeting kompakt, Liste als Cards)

### Phase 4 ✅ wenn:
- [ ] `DataTable` nutzt TanStack Table intern
- [ ] Column-Pinning funktioniert (erste Spalte)
- [ ] 100+ Rows rendern ohne Lag (Virtualisation)

### Phase 5 ✅ wenn:
- [ ] Kanzlei-Insights zeigen Tremor Charts (Area/Bar)
- [ ] Charts passen sich an Dark/Light Theme an
- [ ] Charts haben Hover-Tooltips

### Gesamt ✅ wenn:
- [ ] Erstnutzer sieht AI-Greeting + "Neue Akte" CTA
- [ ] Power-User kann ⌘E → Frage → Enter → Copilot antwortet
- [ ] Fristen sind innerhalb 2 Sekunden sichtbar
- [ ] KI-Agenten-Status ist live und korrekt
- [ ] Dark/Light Mode funktioniert für alle neuen Komponenten
- [ ] Mobile Layout ist voll funktionsfähig
- [ ] Keine WCAG-AA Kontrast-Verstöße
- [ ] Lighthouse Score ≥ 90 für Performance

---

## 11. Tech-Stack

| Layer | Technologie | Status |
|---|---|---|
| Framework | Next.js 15 + React 19 | ✅ vorhanden |
| Styling | Tailwind CSS 4 | ✅ vorhanden |
| UI Primitives | shadcn/ui (Radix) | ✅ vorhanden |
| Icons | Lucide React | ✅ vorhanden |
| Animation | Framer Motion | ✅ vorhanden |
| State | Zustand + TanStack Query | ✅ vorhanden |
| **Tables** | **TanStack Table** | **⬜ neu** |
| **Charts** | **Tremor** | **⬜ neu** |
| Design Tokens | Untitled UI (als CSS-Vars) | ⬜ neu Overlay |

---

## 12. Referenz-Mapping

| Referenz | Was wir übernehmen | Was wir NICHT übernehmen |
|---|---|---|
| **Untitled UI** | Token-Werte (Radius, Spacing), Component-Anatomy | Figma-Abhängigkeit (wir sind Code-First) |
| **Linear** | Density (13px, py-2.5), Keyboard-First, Status-Dots, Calm UI | Issue-Track-Feature-Set (wir sind Legal, nicht PM) |
| **Attio** | AI-Priorisierung, Live-Agent-Status, Inline-Suggestions | CRM-Features (wir haben Cases, nicht Contacts als primär) |
| **Mercury** | Hero-Number (text-7xl), Trust-Gradient, "eine dominante Zahl" | Banking/Finance-Features |
| **Lazarev eDiscovery** | 2-Tier Sidebar Filter, Tag-System sichtbar, Contextual Alerts | Vollständiges Filter-UI (Phase 2) |
| **OpenAI ChatGPT Team** | Inline-Chat-Eingabe als Entry-Point, Quick-Action Chips | ChatGPT-Branding, Model-Selector im Main-UI |
| **Notion** | Dokumenten-Workspace-Feeling (für Vault-Seite) | Block-Editor (zu komplex für Phase 1) |
| **Stripe Dashboard** | Tabellen-Density, Detailansichten | Payment-Features |
| **Vercel Dashboard** | Minimalismus, Binary-Status-Board | Deployment-Features |
