# Legal AI OS — Redesign Blueprint v2

> **Status:** Draft v2 — 2026-06-26  
> **Ziel:** Transformation vom klassischen Dashboard zu einem AI-native Legal Workspace  
> **Referenz-Gewichtung:** 40% Linear · 25% Attio · 20% OpenAI · 10% Notion · 5% Stripe  
> **Design-Philosophie:** Ruhig, fast langweilig. Nach 3 Monaten: "Ich arbeite unglaublich schnell."  
> **Fokus-Gewichtung:** 20% Dashboard · 60% Workspace · 20% Design-System

---

## 0. Design-Prinzipien (NICHT VERHANDELBAR)

1. **Kein Wow-Effekt.** Linear, OpenAI, Cursor, Vercel, GitHub, Raycast sind erfolgreich, weil sie fast langweilig wirken. Gutes UX = Geschwindigkeit nach 3 Monaten, nicht Spektakel am Tag 1.
2. **Kein Glassmorphism.** Legal Software braucht Kontrast, Lesbarkeit, Geschwindigkeit. Keine Milchglas-Effekte.
3. **Keine bunten Gradient-Karten.** Farbe ist funktional (Rot = kaputt, Grün = ok, Blau = Akzent), nicht dekorativ.
4. **Panels statt Cards.** Split Views, Resizable Areas, Inline Panels, Command Bars — keine Card-Grids (`□ □ □ □`).
5. **AI ist überall, nicht ein Feature.** Die KI ist ein Layer über allem, nicht eine Sektion im Dashboard.
6. **Linear-Calm.** Informationsdichte ohne Überladung. Fast keine dekorativen Elemente. Konsistente Abstände. Tastatur-first.
7. **80% der Zeit ist Workspace, nicht Dashboard.** Der Anwalt lebt in: Mandant → Akte → Dokumente → Fristen → Kommunikation → KI. Das Dashboard ist nur der Einstieg.

---

## 1. Ziel des Systems (User-Sicht)

**Heute:** Der Anwalt öffnet ein Dashboard, sieht Metriken und muss selbst navigieren.  
**Ziel:** Der Anwalt öffnet seinen Workspace, sieht ruhig was heute ansteht, die KI arbeitet im Hintergrund und unterstützt jeden Workflow — nicht als Chat, sondern als Activity-Feed: "Frist erkannt ✓, Schriftsatz vorgeschlagen ✓, Rechtsprechung gefunden ✓, beA Nachricht vorbereitet ✓".

Das System fühlt sich an wie **Linear + OpenAI ChatGPT Team + Notion**, nicht wie ein Admin-Template.

---

## 2. Kern-Userflows

### Beginner (Erstkontakt)

1. Login → Onboarding (bestehend)
2. Workspace öffnet sich → Calm Greeting: "Guten Morgen, [Name]." + "Heute: 1 Frist, 2 beA-Nachrichten. KI empfiehlt: → Fall Müller zuerst bearbeiten."
3. Klick auf Empfehlung → direkt zur Akte
4. Copilot bleibt als Seitenpanel sichtbar, aber unaufdringlich

### Normal (Tägliche Nutzung — 80% der Zeit im Workspace)

1. Home → kurzer Überblick → Klick auf Akte → **Workspace-Modus**
2. Workspace = Akte → Dokumente → Fristen → Kommunikation → KI — alles in einer Split-View
3. KI arbeitet im Hintergrund: erkennt Fristen, schlägt Schriftsätze vor, findet Rechtsprechung
4. Activity-Feed rechts (nicht Chat): "✓ Frist erkannt: 14 Tage ab heute" / "✓ Schriftsatz-Entwurf bereit" / "✓ Recherche: 3 relevante Urteile"
5. ⌘K für Command Palette → Navigation ohne Maus

### Power-User

1. ⌘J öffnet Copilot direkt → "Fasse Akte Müller-Insolvenz zusammen" → KI antwortet mit Citations
2. ⌘K → "Frist eintragen" → Form-Dialog ohne Seitenwechsel
3. Keyboard-Only Navigation durch alle Sektionen
4. Activity-Feed zeigt Live-Status aller KI-Agenten

---

## 3. Layout-Konzept

### 3.1 Home (Dashboard — 20% der Zeit)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Topbar: Logo · ⌘ Suche... · Notifications · Theme · User           │
├──────────┬──────────────────────────────────────┬───────────────────┤
│          │                                      │                   │
│ Sidebar  │  Main Content                        │  Activity Panel   │
│ (220px)  │                                      │  (360px, toggle)  │
│          │  Guten Morgen, Ismet.    26. Juni    │                   │
│ ───────  │                                      │  Activity Feed    │
│ Home     │  ┌──────────────────────────────┐    │  ✓ Frist erkannt  │
│ Matters  │  │ Heute                        │    │  ✓ Schriftsatz    │
│ Clients  │  │                              │    │  ✓ Recherche      │
│ Docs     │  │ 5 Fristen                    │    │  ✓ beA vorbereitet│
│ Research │  │ 2 beA Nachrichten             │    │                   │
│ AI       │  │ 1 Gerichtstermin              │    │  Quick actions    │
│ ───────  │  │                              │    │  Chat (auf ⌘J)    │
│ Deadlines│  │ KI empfiehlt:                │    │                   │
│ beA      │  │ → Fall Müller zuerst          │    │                   │
│ Messages │  │ → Frist Klageerwiderung prüfen│    │                   │
│ ───────  │  └──────────────────────────────┘    │                   │
│ Autom.   │                                      │                   │
│ Settings │  ┌──────────────────────────────┐    │                   │
│          │  │ Meine Mandate                │    │                   │
│          │  │ ● Müller GmbH      · aktiv   │    │                   │
│          │  │ ● Schneider AG     · wartend │    │                   │
│          │  │ ● Insolvenz ...     · dringend│    │                   │
│          │  └──────────────────────────────┘    │                   │
│          │                                      │                   │
│          │  ┌──────────────────────────────┐    │                   │
│          │  │ KI-Aktivität (Live Feed)     │    │                   │
│          │  │ ✓ Vertragsanalyse  3/4       │    │                   │
│          │  │ ⟳ Fristen-Scan     läuft     │    │                   │
│          │  └──────────────────────────────┘    │                   │
│          │                                      │                   │
│          │  ┌──────────────────────────────┐    │                   │
│          │  │ Inbox · Deadlines (Split)    │    │                   │
│          │  └──────────────────────────────┘    │                   │
└──────────┴──────────────────────────────────────┴───────────────────┘
```

### 3.2 Workspace (Akte — 60% der Zeit)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Topbar: ← Home · Akte Müller GmbH · ⌘ Suche · ...                   │
├──────────┬──────────────────────────────────────┬───────────────────┤
│          │                                      │                   │
│ Sidebar  │  Workspace (Split-View)              │  Activity Feed    │
│ (220px)  │                                      │  (360px)          │
│          │  ┌──────────┬──────────────────────┐ │                   │
│ ───────  │  │ Tabs     │ Content              │ │  ✓ Frist erkannt  │
│ Home     │  │          │                      │ │  ✓ Dokument analys│
│ ●Matters │  │ Übersicht│ Aktenzusammenfassung │ │  ⟳ Schriftsatz    │
│  Müller  │  │ Dokumente│ [Dokument-Liste]     │ │  ✓ Recherche      │
│  Schneider│ │ Fristen  │ [Fristen-Timeline]   │ │                   │
│ Clients  │  │ Komm.    │ [beA/WhatsApp/Email] │ │  KI-Suggestion:   │
│ Docs     │  │ KI       │ [KI-Analyse der Akte]│ │  → Klageerwiderung│
│ Research │  │          │                      │ │    fällig in 14 T │
│ AI       │  └──────────┴──────────────────────┘ │                   │
│ ───────  │                                      │  [Chat öffnen ⌘J] │
│ ...      │                                      │                   │
└──────────┴──────────────────────────────────────┴───────────────────┘
```

**Key Difference zum Dashboard:**
Das Workspace-Layout ist ein **Split-View mit Tabs** — keine Cards. Der Anwalt sieht Akte → Dokumente → Fristen → Kommunikation in einem Screen, ohne zu navigieren. Die KI arbeitet rechts als Activity-Feed, nicht als Chat.

### 3.3 Vertikale Reihenfolge (Home/Main Content)

1. **Calm Greeting** — "Guten Morgen, Ismet." + Datum (klein, ruhig)
2. **Heute-Panel** — "5 Fristen, 2 beA, 1 Gerichtstermin. KI empfiehlt: → Fall Müller zuerst" (keine riesige Zahl, calm)
3. **Meine Mandate** — Liste mit Status-Dots (Linear-Style), nicht Card-Grid
4. **KI-Aktivität** — Live Activity-Feed: "✓ Frist erkannt, ✓ Schriftsatz vorgeschlagen" (Attio-Style, nicht Chat)
5. **Inbox + Deadlines** — Split-View Side-by-side (Panels, nicht Cards)
6. **Kanzlei-Insights** — Ganz unten, sekundär (Tremor Charts, klein)

---

## 4. Design-Token-Anpassungen

### Was sich ändert in `globals.css`

| Token                 | Heute       | Ziel          | Begründung                            |
| --------------------- | ----------- | ------------- | ------------------------------------- |
| `--ds-radius-sm`      | 8px         | 6px           | Linear: schärfere Inputs              |
| `--ds-radius-md`      | 12px        | 10px          | Linear: präzisere Panels              |
| Sidebar width         | 256px       | 220px         | Linear: kompakter, mehr Content       |
| `--ds-text-sm`        | 14px        | 13px          | Linear-Density: mehr Zeilen pro Panel |
| Panel padding         | 24px        | 20px          | Linear: dichter                       |
| Row padding           | 12px (py-3) | 10px (py-2.5) | Linear: mehr Items pro Screen         |
| `--ds-transition-tap` | 150ms       | 120ms         | Linear: schnelleres Feedback          |

### Neue Tokens

```css
/* Linear-Calm Tokens */
--ds-surface-elevated: /* für Modals, Popovers — 1 Stufe über --ds-surface */ --ds-focus-ring:
  /* 2px solid var(--brand-primary) mit 0.5 offset */
  --ds-transition-tap: 120ms cubic-bezier(0.22, 1, 0.36, 1);

/* AI Activity Feed Tokens */
--ai-activity-dot: 6px; /* Status-Indikator */
--ai-activity-success: var(--ds-success-text); /* ✓ */
--ai-activity-running: var(--brand-primary); /* ⟳ */
--ai-activity-pending: var(--ds-text-muted); /* ○ */

/* Split-View Tokens */
--split-divider: 1px solid var(--ds-border);
--split-divider-hover: var(--brand-primary);
--split-min-width: 320px;
```

### Explizit NICHT verwendet

- `backdrop-blur` / Glassmorphism-Effekte
- `bg-gradient-to-br` für dekorative Zwecke (nur funktional für Status)
- `text-7xl` / riesige Hero-Numbers (Mercury-Style entfernt)
- Bunte Gradient-Karten

---

## 5. Komponenten-Änderungen

### 5.1 `widget-dashboard.tsx` → `workspace-dashboard.tsx`

**Neue Komponenten:**

| Komponente       | Status                              | Was sich ändert                                                                                                                                                  |
| ---------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CalmGreeting`   | **Neu**                             | "Guten Morgen, [Name]" — ruhig, klein, kein Spektakel. + Inline-Copilot-Eingabe (dezent, nicht prominent)                                                        |
| `HeutePanel`     | **Neu** (ersetzt `CockpitHero`)     | Calm Zusammenfassung: "5 Fristen, 2 beA, 1 Gerichtstermin. KI empfiehlt: → Fall Müller zuerst" — keine riesige Zahl, sondern eine ruhige Liste mit KI-Empfehlung |
| `QuickActions`   | **Redesign**                        | Command-Bar-Style, nicht Tile-Grid. Inline-Buttons, nicht quadratische Cards                                                                                     |
| `MandateList`    | **Neu** (ersetzt `ActiveCasesList`) | Linear-Style Liste mit Status-Dot, KI-Summary-Zeile, Pin-Funktion                                                                                                |
| `AIActivityFeed` | **Neu** (ersetzt `AgentStatus`)     | Attio-Style Activity-Feed: "✓ Frist erkannt, ✓ Schriftsatz vorgeschlagen, ⟳ Recherche läuft" — kein Chat, sondern Hintergrund-Aktivität                          |
| `SecondaryStats` | **Redesign**                        | Inline-Text-Stats, keine Cards. "112 offen · 34 warten · 7 Fristen heute" in einer Zeile                                                                         |
| `DeadlineList`   | **Redesign**                        | `py-2.5`, Icon `h-7 w-7`, KI-Summary-Zeile                                                                                                                       |
| `InboxList`      | **Redesign**                        | Gleiche Density-Anpassung                                                                                                                                        |
| `PinnedMatters`  | **Redesign**                        | Schmalere Pills, `text-xs`                                                                                                                                       |

**`CalmGreeting` Spezifikation:**

```
Guten Morgen, Ismet.                              Do, 26. Juni

┌──────────────────────────────────────────────────────────────────┐
│ Heute                                                            │
│                                                                  │
│ 5 Fristen                                                        │
│ 2 beA Nachrichten                                                │
│ 1 Gerichtstermin                                                 │
│                                                                  │
│ KI empfiehlt:                                                    │
│ → Fall Müller zuerst bearbeiten                                  │
│ → Frist Klageerwiderung Schneider prüfen (3 Tage)                │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  Welche Aufgabe möchtest du erledigen?                     [↑]   │
└──────────────────────────────────────────────────────────────────┘
```

- Kein `text-7xl`, kein Gradient, kein Spektakel
- "Heute" ist eine ruhige Liste, nicht eine riesige Zahl
- KI-Empfehlungen als klickbare Links
- Input-Eingabe dezent unten, nicht prominent oben
- Enter öffnet Copilot-Sidebar mit der Frage

**`AIActivityFeed` Spezifikation:**

```
┌──────────────────────────────────────────────────────────┐
│ KI-Aktivität                                    [Alle ansehen] │
│                                                            │
│ ✓ Frist erkannt              Müller GmbH · 14 Tage         │
│ ✓ Schriftsatz vorgeschlagen  Schneider AG · Klageerwiderung│
│ ✓ Rechtsprechung gefunden    3 relevante Urteile            │
│ ⟳ Vertragsanalyse läuft      3/4 fertig                     │
│ ○ beA Nachricht vorbereitet  wartet auf Freigabe            │
└──────────────────────────────────────────────────────────┘
```

- **Kein Chat!** Das ist kein Chat-Interface. Es ist ein Background-Activity-Feed.
- Jede Zeile: Status-Icon + Aktion + Kontext
- Klick auf Zeile → jeweilige Seite/Akte
- Status-Icons: ✓ (success), ⟳ (running), ○ (pending)
- Daten aus `agent_action` Pages (bestehende Query)
- Keine Progress-Bars (zu laut) — stattdessen Text-Status "3/4 fertig"

### 5.2 `sidebar.tsx` — Linear Density

**Änderungen:**

- Width: 256px → 220px (collapsed: 64px bleibt)
- Font: `text-sm` → `text-[13px]` für Nav-Items
- Section Headers: `text-xs` → `text-[11px]` uppercase tracking-wider
- Active Item: 2px left-border + subtle background tint (Linear-Style)
- Icon size: 16px → 15px
- Row padding: `py-2` → `py-1.5` für mehr Items pro Screen
- Keine decorative Icons, keine Badges in Sidebar (außer Counter für unread)

**Navigation-Struktur (AI ist überall, nicht Sektion):**

```
Home
Mandate
  Müller GmbH
  Schneider AG
  ...
Mandanten
Dokumente
Recherche
Deadlines
beA
Nachrichten
Automation
──────────
Einstellungen
Team
Audit-Log
```

- "AI" ist KEINE eigene Sektion in der Sidebar — AI ist ein Layer
- Activity-Feed ist immer rechts sichtbar (wie Copilot-Sidebar)
- Chat ist über ⌘J erreichbar, nicht als Sidebar-Item

### 5.3 `topbar.tsx` — Minimaler Redesign

**Änderungen:**

- Höhe: `h-14` → `h-12` (kompakter)
- Search bar: `⌘ Suche...` — breiter, `max-w-lg`, Keyboard-Shortcuts sichtbar
- Brain-Selector: schmaler, nur Icon + Name
- Notifications: Bell-Icon mit Badge-Counter (bestehend)
- Theme-Toggle: bleibt
- User-Menu: Avatar + Name (nicht Email)

### 5.4 `copilot-sidebar.tsx` → `activity-sidebar.tsx`

**Paradigmenwechsel:** Der rechte Panel wird primär als **Activity-Feed** genutzt, nicht als Chat. Chat ist sekundär (auf Klick/⌘J).

**Was bleibt:**

- Route-Context Detection (bestehend, gut)
- Quick Actions (bestehend, gut)
- Proactive Alerts (bestehend, gut)
- Resize-Handle (bestehend, gut)

**Was sich ändert:**

- Width: 380px → 360px
- **Default View:** Activity-Feed (nicht Chat-Empty-State)
- Chat ist ein Tab/Modus im Panel, nicht der Default
- Header: "Aktivität" statt "Copilot" — Chat ist über Button/⌘J erreichbar
- Quick Action Tiles: `text-[11px]` (dichter)

**Panel-Struktur:**

```
┌──────────────────────────────────┐
│ ● Aktivität          [Chat ⌘J]  │
├──────────────────────────────────┤
│ ✓ Frist erkannt       14 Tage    │
│ ✓ Schriftsatz bereit  Klageerw.  │
│ ⟳ Recherche läuft     3/4        │
│ ○ beA wartet          Freigabe   │
│                                  │
│ ── Quick Actions ──              │
│ [Frist eintragen] [Neue Akte]    │
│ [Dokument analysieren]           │
│                                  │
│ ── Proactive Alerts ──           │
│ ⚠ Frist überfällig: Müller       │
└──────────────────────────────────┘
```

### 5.5 Neue UI-Primitives

**`ui/progress.tsx` (neu):**

- Linear-Style: 3px hoch, `--brand-primary` fill, rounded-full
- Nur für Loading-States, nicht für Agent-Status (Agent-Status = Text)

**`ui/split-view.tsx` (neu, Phase 4):**

- Resizable Split-View für Workspace (Akte → Dokumente | Fristen)
- Divider: 1px, dragbar, `--brand-primary` on hover
- Min-width: 320px pro Panel

**`data-table.tsx` → TanStack Table Migration (Phase 5):**

- Bestehende `DataTable` ist handwritten mit eigenem Sort/Paginate
- Migration zu `@tanstack/react-table` für: Column-Pinning, Column-Visibility, Row-Selection, Virtualisation
- API bleibt gleich (`Column<T>` Interface), nur Internals ändern sich

---

## 6. Workspace-Modus (60% der Zeit — NEU)

### 6.1 Konzept

Der Workspace-Modus ist der wichtigste Teil des Systems. Wenn der Anwalt auf eine Akte klickt, öffnet sich nicht einfach eine Detail-Seite, sondern ein **Split-View Workspace**:

```
┌─────────────────────────────────────────────────────────┐
│ ← Home · Akte Müller GmbH · [Bearbeiten] · [...]        │
├──────────┬────────────────────────┬─────────────────────┤
│          │                        │                     │
│ Sidebar  │  Tabs                  │  Activity Feed      │
│          │  Übersicht│Dokumente│  │  (rechter Panel)    │
│          │  Fristen│Komm.│KI      │                     │
│          │                        │  ✓ Frist erkannt    │
│          │  [Tab-Content]         │  ✓ Schriftsatz      │
│          │                        │  ⟳ Recherche        │
│          │                        │                     │
│          │                        │  [Chat ⌘J]          │
└──────────┴────────────────────────┴─────────────────────┘
```

### 6.2 Tabs im Workspace

| Tab           | Inhalt                                                    | Datenquelle                         |
| ------------- | --------------------------------------------------------- | ----------------------------------- |
| Übersicht     | Aktenzusammenfassung, Parteien, Status                    | `legal_case` Frontmatter            |
| Dokumente     | Dokument-Liste mit Inline-Preview                         | `document` + `legal_document` Pages |
| Fristen       | Fristen-Timeline (vertikal)                               | `legal_deadline` Pages              |
| Kommunikation | beA, WhatsApp, Email — unified Thread                     | `bea_message`, `whatsapp_message`   |
| KI            | KI-Analyse der Akte: Zusammenfassung, Risiken, Vorschläge | On-demand via Chat API              |

### 6.3 Activity-Feed im Workspace

Der Activity-Feed (rechter Panel) zeigt **kontextbezogene KI-Aktivitäten** für die aktuelle Akte:

- "✓ Frist erkannt: 14 Tage ab heute"
- "✓ Schriftsatz-Entwurf bereit: Klageerwiderung"
- "✓ Recherche: 3 relevante Urteile zu § 280 BGB"
- "⟳ Vertragsanalyse läuft: 3/4 Dokumente analysiert"
- "○ beA Antwort vorbereitet: wartet auf Freigabe"

**Das ist kein Chat.** Das ist die KI, die im Hintergrund arbeitet und Ergebnisse präsentiert. Der Chat ist über ⌘J erreichbar, wenn der Anwalt eine Frage stellen will.

---

## 7. Datenmodell & State-Management

### Bestehend (bleibt)

- `useBrainStats()` — Kanzlei-Metriken
- `usePages({ type })` — Akten, Fristen, Rechnungen, etc.
- `useRecentMatters()` — Pinned/Recent Cases
- `useRecentQueries()` — Letzte KI-Anfragen
- `useMutationQueue()` — Offline-Sync
- `useNetworkStatus()` — Online/Offline

### Neu

- `useAIActivity()` — Aggregiert `agent_action` Pages nach Typ → Activity-Feed Items
- `useTodaySummary()` — Aggregiert Fristen + beA + Gerichtstermine für "Heute"-Panel
- `useWorkspaceGreeting()` — Zeitbasierte Begrüßung + User-Name aus `useMe()`
- `useCaseWorkspace(slug)` — Unified Hook für Workspace-Modus: Akte + Dokumente + Fristen + Kommunikation

### State (Zustand)

- `copilotOpen` — bestehend in `layout.tsx` (wird zu `activityPanelOpen`)
- `collapsed` (Sidebar) — bestehend
- `theme` — bestehend
- `workspaceTab` — aktiver Tab im Workspace-Modus (neu)
- `activityFilter` — Filter im Activity-Feed (alle / akte / global) (neu)

---

## 8. Architektur-Entscheidungen

### 8.1 CalmGreeting statt Mercury-Hero

**Entscheidung:** Keine riesige Hero-Number (`text-7xl`). Statt dessen eine ruhige "Heute"-Liste.  
**Begründung:** Riesige KPI-Zahlen funktionieren für Fintech (Mercury). Für Kanzleien wirkt das laut. Anwälte wollen wissen: "Was muss ich heute erledigen?" — nicht "Wie groß ist die Zahl 47?".  
**Implementierung:** `HeutePanel` mit ruhiger Liste + KI-Empfehlung als klickbarer Link.

### 8.2 Activity-Feed statt Chat als Default

**Entscheidung:** Der rechte Panel zeigt primär KI-Aktivitäten (Activity-Feed), nicht Chat. Chat ist sekundär über ⌘J.  
**Begründung:** Attio-Ansatz: "Die KI arbeitet im Hintergrund und unterstützt jeden Workflow." Ein Chat-Empty-State ("Wie kann ich helfen?") ist passiv. Ein Activity-Feed ("✓ Frist erkannt, ✓ Schriftsatz bereit") ist aktiv und zeigt Wert sofort.  
**Implementierung:** `activity-sidebar.tsx` ersetzt `copilot-sidebar.tsx` als Default-View. Chat ist ein Modus im gleichen Panel.

### 8.3 Panels statt Cards

**Entscheidung:** Layout verwendet Split-Views, Inline-Panels und Command-Bars — keine Card-Grids.  
**Begründung:** 2026 Trend geht weg von `□ □ □ □` Card-Mustern hin zu Panels, Split Views, Resizable Areas. Cards wirken langsam und fragmentiert. Panels sind fließend und dicht.  
**Implementierung:** `ui/split-view.tsx` (neu), Inbox+Deadlines als Split-View statt zwei Cards nebeneinander.

### 8.4 AI ist Layer, nicht Sektion

**Entscheidung:** "AI" ist keine Sektion in der Sidebar und kein Tab im Dashboard. AI ist ein Layer, der über allem liegt — sichtbar als Activity-Feed rechts.  
**Begründung:** Wenn AI eine Sektion ist, wird sie wie jedes andere Feature behandelt und ignoriert. Wenn AI ein Layer ist, ist sie immer präsent und unterstützt jeden Workflow.  
**Implementierung:** Activity-Feed ist immer sichtbar (wie Copilot-Sidebar). Chat über ⌘J. KI-Analyse im Workspace als Tab (aber das ist Akten-spezifische Analyse, nicht "die KI").

### 8.5 Workspace-Modus als primäre Oberfläche

**Entscheidung:** 60% der Investition geht in den Workspace-Modus (Akte → Split-View), nicht in das Dashboard.  
**Begründung:** Anwälte verbringen 80% ihrer Zeit in Akten, nicht auf dem Dashboard. Das Dashboard ist der Einstieg (20%), der Workspace ist wo die Arbeit passiert (60%).  
**Implementierung:** Phase 4 baut den Workspace-Modus. Phase 1-3 baut das Dashboard-Redesign.

### 8.6 TanStack Table als Phase 5

**Entscheidung:** TanStack Table wird installiert, aber die Migration ist Phase 5.  
**Begründung:** Die bestehende `DataTable` funktioniert. Das Redesign ist visuell, nicht strukturell.  
**Implementierung:** `bun add @tanstack/react-table` in Phase 1, Migration in Phase 5.

### 8.7 Tremor für Charts als Phase 5

**Entscheidung:** Tremor wird installiert für Kanzlei-Insights, aber die bestehenden SVG-Charts bleiben vorerst.  
**Begründung:** Kanzlei-Insights sind sekundär (ganz unten, 20% Dashboard). Die SVG-Charts funktionieren.  
**Implementierung:** `bun add @tremor/react` in Phase 1, Integration in Phase 5.

---

## 9. Edge-Cases & Fehlerszenarien

| Szenario                                    | Verhalten                                                                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Erstnutzer (keine Akten, keine Fristen)** | CalmGreeting: "Willkommen! Lass uns deine erste Akte anlegen." + Quick-Action "Neue Akte" hervorgehoben. Kein Heute-Panel, keine Mandate-Liste.                |
| **Engine offline**                          | CalmGreeting: "Ich bin aktuell offline. Du kannst trotzdem Akten bearbeiten — ich synchronisiere später." + Offline-Badge. Heute-Panel zeigt "—" statt Zahlen. |
| **100+ Akten**                              | MandateList: `slice(0, 10)` + "Alle ansehen" Link — Phase 5: TanStack Virtual                                                                                  |
| **Keine KI-Aktivität**                      | AIActivityFeed: "Keine aktiven KI-Aufgaben. Starte einen Workflow um KI zu delegieren." + Link zu `/dashboard/workflows`                                       |
| **Mobile (< 768px)**                        | CalmGreeting: kompakt, Activity-Feed als Bottom-Sheet, MandateList als Liste (bleibt), Split-View wird zu Tabs                                                 |
| **Dark Mode**                               | Alle neuen Komponenten nutzen `--ds-*` Tokens → automatisches Dark Mode                                                                                        |
| **Reduce Motion**                           | CalmGreeting ohne Fade-In, Activity-Feed ohne Animation                                                                                                        |
| **Schnelles Klicken**                       | Activity-Feed Items sind nicht-interaktiv bis KI-Task completed (keine halben Ergebnisse)                                                                      |

---

## 10. Arbeitspakete (Task Breakdown)

### Phase 1: Visual Foundation (Tag 1-2)

| Paket                    | Ziel                                                      | Dateien           | Aufwand |
| ------------------------ | --------------------------------------------------------- | ----------------- | ------- |
| **P1.1 Token-Update**    | Linear-Density Tokens in globals.css, keine Glassmorphism | `globals.css`     | 1h      |
| **P1.2 Sidebar Density** | Width 220px, Font 13px, Row py-1.5, Active 2px border     | `sidebar.tsx`     | 2h      |
| **P1.3 Topbar Compact**  | Höhe h-12, Search breiter, User-Menu Avatar+Name          | `topbar.tsx`      | 1h      |
| **P1.4 UI Primitives**   | `progress.tsx` (3px Linear-Style)                         | `ui/progress.tsx` | 1h      |
| **P1.5 Dependencies**    | TanStack Table + Tremor installieren                      | `package.json`    | 0.5h    |

### Phase 2: Home Redesign (Tag 2-3)

| Paket                   | Ziel                                                    | Dateien                         | Aufwand |
| ----------------------- | ------------------------------------------------------- | ------------------------------- | ------- |
| **P2.1 CalmGreeting**   | Ruhige Begrüßung + dezent Inline-Chat-Eingabe           | `workspace-dashboard.tsx` (neu) | 2h      |
| **P2.2 HeutePanel**     | Calm "Heute"-Liste + KI-Empfehlung (keine riesige Zahl) | `workspace-dashboard.tsx`       | 2h      |
| **P2.3 MandateList**    | Linear-Style Liste mit Status-Dots                      | `workspace-dashboard.tsx`       | 2h      |
| **P2.4 AIActivityFeed** | Attio-Style Activity-Feed (✓ ⟳ ○)                       | `workspace-dashboard.tsx`       | 2h      |
| **P2.5 QuickActions**   | Command-Bar-Style, nicht Tile-Grid                      | `workspace-dashboard.tsx`       | 1h      |
| **P2.6 SecondaryStats** | Inline-Text-Stats, keine Cards                          | `workspace-dashboard.tsx`       | 1h      |

### Phase 3: Activity Sidebar (Tag 3-4)

| Paket                     | Ziel                                                     | Dateien                                            | Aufwand |
| ------------------------- | -------------------------------------------------------- | -------------------------------------------------- | ------- |
| **P3.1 ActivitySidebar**  | Rechter Panel: Activity-Feed als Default, Chat als Modus | `activity-sidebar.tsx` (umbau von copilot-sidebar) | 3h      |
| **P3.2 QueueRow Density** | py-2.5, Icon h-7 w-7, KI-Summary-Zeile                   | `workspace-dashboard.tsx`                          | 2h      |
| **P3.3 PinnedMatters**    | Schmalere Pills                                          | `workspace-dashboard.tsx`                          | 1h      |
| **P3.4 Empty States**     | Warm + actionable                                        | `workspace-dashboard.tsx`                          | 1h      |
| **P3.5 Mobile Layout**    | CalmGreeting kompakt, Activity als Bottom-Sheet          | `workspace-dashboard.tsx`                          | 2h      |

### Phase 4: Workspace-Modus (Tag 4-6) — 60% der Investition

| Paket                          | Ziel                                          | Dateien                    | Aufwand |
| ------------------------------ | --------------------------------------------- | -------------------------- | ------- |
| **P4.1 CaseWorkspace Layout**  | Split-View mit Tabs für Akte                  | `case-workspace.tsx` (neu) | 4h      |
| **P4.2 CaseOverview Tab**      | Aktenzusammenfassung, Parteien, Status        | `case-workspace.tsx`       | 2h      |
| **P4.3 CaseDocuments Tab**     | Dokument-Liste mit Inline-Preview             | `case-workspace.tsx`       | 3h      |
| **P4.4 CaseDeadlines Tab**     | Fristen-Timeline (vertikal)                   | `case-workspace.tsx`       | 2h      |
| **P4.5 CaseCommunication Tab** | beA/WhatsApp/Email unified Thread             | `case-workspace.tsx`       | 3h      |
| **P4.6 CaseAI Tab**            | KI-Analyse der Akte: Zusammenfassung, Risiken | `case-workspace.tsx`       | 2h      |
| **P4.7 SplitView Component**   | Resizable Split-View Primitive                | `ui/split-view.tsx` (neu)  | 2h      |

### Phase 5: TanStack Table + Tremor (Tag 6-7)

| Paket                        | Ziel                                    | Dateien                   | Aufwand |
| ---------------------------- | --------------------------------------- | ------------------------- | ------- |
| **P5.1 DataTable Migration** | Internals zu TanStack Table, API bleibt | `data-table.tsx`          | 4h      |
| **P5.2 Column-Pinning**      | Erste Spalte pinbar                     | `data-table.tsx`          | 1h      |
| **P5.3 Virtualisation**      | Virtuelle Liste für 100+ Rows           | `data-table.tsx`          | 2h      |
| **P5.4 Kanzlei-Insights**    | Tremor Charts für Umsatz, Auslastung    | `workspace-dashboard.tsx` | 2h      |
| **P5.5 Chart Theme**         | Tremor an --ds-\* Tokens anpassen       | `globals.css`             | 1h      |

---

## 11. Definition of Done

### Phase 1 ✅ wenn:

- [ ] Sidebar ist 220px breit, Font ist 13px, Row padding py-1.5
- [ ] Topbar ist h-12 hoch
- [ ] `progress.tsx` existiert (3px Linear-Style)
- [ ] `@tanstack/react-table` und `@tremor/react` in `package.json`
- [ ] Kein `backdrop-blur` in neuen Komponenten

### Phase 2 ✅ wenn:

- [ ] `CalmGreeting` zeigt "Guten Morgen, [Name]" — ruhig, kein Spektakel
- [ ] `HeutePanel` zeigt "5 Fristen, 2 beA, 1 Gerichtstermin" als Liste, nicht als riesige Zahl
- [ ] `MandateList` zeigt Akten mit Status-Dots (aktiv/wartend/dringend)
- [ ] `AIActivityFeed` zeigt "✓ Frist erkannt, ⟳ Recherche läuft" — nicht Chat
- [ ] `SecondaryStats` zeigt Inline-Text, keine Cards
- [ ] Keine `text-7xl` Hero-Number irgendwo

### Phase 3 ✅ wenn:

- [ ] Rechter Panel zeigt Activity-Feed als Default, Chat über ⌘J
- [ ] QueueRows haben `py-2.5` und `h-7 w-7` Icon-Tiles
- [ ] Mobile Layout funktioniert (CalmGreeting kompakt, Activity als Bottom-Sheet)

### Phase 4 ✅ wenn:

- [ ] Klick auf Akte öffnet Workspace-Modus (Split-View mit Tabs)
- [ ] Tabs: Übersicht, Dokumente, Fristen, Kommunikation, KI
- [ ] Activity-Feed rechts zeigt kontextbezogene KI-Aktivitäten für die Akte
- [ ] Split-View ist resizable
- [ ] Mobile: Split-View wird zu Tabs

### Phase 5 ✅ wenn:

- [ ] `DataTable` nutzt TanStack Table intern
- [ ] 100+ Rows rendern ohne Lag (Virtualisation)
- [ ] Kanzlei-Insights zeigen Tremor Charts
- [ ] Charts passen sich an Dark/Light Theme an

### Gesamt ✅ wenn:

- [ ] Erstnutzer sieht CalmGreeting + "Neue Akte" CTA
- [ ] Power-User kann ⌘J → Frage → Enter → Copilot antwortet
- [ ] Fristen sind innerhalb 2 Sekunden sichtbar (ruhig, nicht laut)
- [ ] KI-Aktivität ist als Feed sichtbar (nicht als Chat-Empty-State)
- [ ] Workspace-Modus (Akte → Split-View) funktioniert für 80% der Nutzung
- [ ] Dark/Light Mode funktioniert für alle neuen Komponenten
- [ ] Mobile Layout ist voll funktionsfähig
- [ ] Keine WCAG-AA Kontrast-Verstöße
- [ ] **Kein Glassmorphism, keine Gradient-Karten, keine riesigen Hero-Numbers**
- [ ] **Das System wirkt ruhig — nach 3 Monaten fühlt man sich schnell**

---

## 12. Tech-Stack

| Layer          | Technologie                               | Status               |
| -------------- | ----------------------------------------- | -------------------- |
| Framework      | Next.js 15 + React 19                     | ✅ vorhanden         |
| Styling        | Tailwind CSS 4                            | ✅ vorhanden         |
| UI Primitives  | shadcn/ui (Radix)                         | ✅ vorhanden         |
| Icons          | Lucide React                              | ✅ vorhanden         |
| Animation      | Framer Motion (dezent, nicht spektakulär) | ✅ vorhanden         |
| State          | Zustand + TanStack Query                  | ✅ vorhanden         |
| **Tables**     | **TanStack Table**                        | **⬜ neu (Phase 5)** |
| **Charts**     | **Tremor**                                | **⬜ neu (Phase 5)** |
| **Split-View** | **Custom `ui/split-view.tsx`**            | **⬜ neu (Phase 4)** |

---

## 13. Referenz-Mapping (v2)

| Referenz                | Gewichtung | Was wir übernehmen                                                                                                  | Was wir NICHT übernehmen                |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Linear**              | **40%**    | Density (13px, py-1.5), Keyboard-First, Status-Dots, Calm UI, konsistente Abstände, Fast keine dekorativen Elemente | Issue-Track-Feature-Set                 |
| **Attio**               | **25%**    | AI als Background-Activity (nicht Chat), Live-Status, Inline-Suggestions, "KI arbeitet im Hintergrund"              | CRM-Features                            |
| **OpenAI ChatGPT Team** | **20%**    | Copilot-Interaktionen auf ⌘J, Schreibunterstützung, Quick-Action Chips                                              | ChatGPT-Branding, Chat als Default-View |
| **Notion**              | **10%**    | Dokumenten-Workspace-Feeling, Wissensmanagement                                                                     | Block-Editor                            |
| **Stripe Dashboard**    | **5%**     | Tabellen-Density, Detailansichten                                                                                   | Payment-Features, große KPI-Numbers     |

### Explizit NICHT referenziert

- **Mercury** — riesige Hero-Numbers passen nicht zu Legal (calm, nicht laut)
- **Dribbble Glassmorphism** — keine Milchglas-Effekte in Legal Software
- **Bunte Gradient-Karten** — Farbe ist funktional, nicht dekorativ
- **Animierte KPI-Dashboards** — das System soll ruhig wirken, nicht animiert
- **Überladene Admin-Templates** — TailAdmin etc. sind nicht die Referenz

---

## 14. Gewichtung der Investition

| Bereich                                                             | Gewichtung | Phasen            |
| ------------------------------------------------------------------- | ---------- | ----------------- |
| **Workspace (Mandat, Dokumente, KI-Assistenz)**                     | **60%**    | Phase 4           |
| **Dashboard (Home, Übersicht)**                                     | **20%**    | Phase 2-3         |
| **Design-System (Typografie, Abstände, Interaktionen, Konsistenz)** | **20%**    | Phase 1, verteilt |

Das bedeutet: Phase 4 (Workspace-Modus) bekommt die meiste Zeit und Aufwand. Das Dashboard-Redesign (Phase 2-3) ist wichtig, aber nicht der Hauptfokus.
