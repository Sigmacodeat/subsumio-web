# Matter Workspace Architecture — Blueprint v3.0

> **Status**: Draft zur Weiterentwicklung
> **Datum**: 30. Juni 2026
> **Basierend auf**: Deep Research von Clio, PracticePanther, Rocket Matter, Harvey AI (Matter OS), CenterBase, LawVu, MyCase, Filevine, Smokeball, Vaquill, CreateOS, Syllo, Juristic, CaseQube + Laws of UX + Expertenmeinungen

---

## 1. VISION

Der Anwalt arbeitet **akten-zentrisch**. Er öffnet eine Akte und findet alles: Dokumente, Fristen, Entwürfe, Kommunikation, Abrechnung, KI-Tools — ohne die Akte verlassen zu müssen. **Die Akte ist die atomare Navigationseinheit.**

### Design-Prinzipien (Industry Standard)

1. **Matter = atomic unit** (Harvey AI) — jede Aktion scoped to a matter
2. **Matter Dashboard als Command Center** (Clio) — alle Daten an einem Ort
3. **Briefcase-Indikator** (PracticePanther) — always-visible "du bist in einer Akte"
4. **Matter Stream** (Rocket Matter) — Activity Feed in Echtzeit
5. **Matter-Scoped Quick Create** — "New" erstellt direkt für aktuelle Akte
6. **Adaptive Sidebar** — Matter-Nav vs Global-Nav, Pinned Matters immer sichtbar
7. **Matter Switcher in Topbar** (Clio "Recents") — Quick-Switch ohne Umweg
8. **Ethical Walls pro Matter** (Harvey AI) — pro Route erzwungen

---

## 2. URL-STRUKTUR: Matter Sub-Routes

### Heute

```
/dashboard/cases                    → Case Liste
/dashboard/cases/[...slug]          → Case Detail (5197 Zeilen Monolith, interne Tabs via useState)
```

### Ziel

```
/dashboard/cases                              → Case Liste (bleibt)
/dashboard/cases/new                          → Neue Akte (bleibt)
/dashboard/cases/[...slug]                    → Matter Overview (Dashboard + Stream)
/dashboard/cases/[...slug]/documents          → Matter Documents
/dashboard/cases/[...slug]/deadlines          → Matter Deadlines + Tasks
/dashboard/cases/[...slug]/drafting           → Matter Drafting (Case-Pre-fill)
/dashboard/cases/[...slug]/research           → Matter Research (scoped)
/dashboard/cases/[...slug]/communications     → Matter Communications
/dashboard/cases/[...slug]/billing            → Matter Billing (RVG, Time, Expenses)
/dashboard/cases/[...slug]/activity           → Matter Activity (Stream + Audit)
/dashboard/cases/[...slug]/ai                 → Matter AI (Chat + Pipeline + Context)
```

### Next.js File Structure

```
src/app/dashboard/cases/[...slug]/
├── layout.tsx              → Matter Shell (Header, Tab-Bar, DataProvider)
├── page.tsx                → Overview (neu: Stream + Widgets)
├── documents/page.tsx      → Documents (aus Monolith extrahiert)
├── deadlines/page.tsx      → Deadlines + Tasks
├── drafting/page.tsx       → Drafting
├── research/page.tsx       → Research
├── communications/page.tsx → Communications
├── billing/page.tsx        → Billing
├── activity/page.tsx       → Activity + Audit Log
├── ai/page.tsx             → AI (Chat + Pipeline + Contradictions)
├── error.tsx               → bleibt
└── loading.tsx             → bleibt
```

**Vorteile**: URL-Deep-Links, Browser-Back/Forward, Code-Splitting, 5197-Zeilen → ~8x 300-600 Zeilen, Sidebar-Highlighting automatisch, Copilot-Context aus URL.

---

## 3. SHARED STATE: MatterDataProvider

Zentraler React Context — lädt Case-Daten **einmal** im Layout, alle Sub-Pages teilen sich den State.

```typescript
// src/lib/matter-context.tsx
interface MatterContextValue {
  slug: string;
  caseData: CaseDetail | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  saveCaseUpdate: (updates: Partial<Record<string, unknown>>) => Promise<void>;
}
```

- Erstellt in `cases/[...slug]/layout.tsx`
- Konsumiert via `useMatterContext()` in jeder Sub-Page
- Keine redundanten API-Calls beim Tab-Wechsel
- `saveCaseUpdate` nutzt bestehende Logik aus aktuellem `page.tsx`

---

## 4. MATTER LAYOUT (`layout.tsx`)

### Visuell

```
┌──────────────────────────────────────────────────────────────┐
│ Matter Header                                                │
│ [📁] Müller vs. Schmidt                                      │
│      2026-001 · Familienrecht · [Offen] · Priorität: Hoch   │
│      [Bearbeiten] [Status ▾] [★ Pin] [⋯ Mehr]              │
├──────────────────────────────────────────────────────────────┤
│ Tab-Bar (horizontal, scrollable)                             │
│ [Overview] [Docs] [Fristen] [Drafting] [Research]            │
│ [Comms] [Billing] [Activity] [AI]                            │
├──────────────────────────────────────────────────────────────┤
│ {children} ← Sub-Page Content                                │
└──────────────────────────────────────────────────────────────┘
```

### MatterHeader (`src/components/legal/matter-header.tsx`)

- Briefcase-Icon + Case Title (fett)
- Case Number · Legal Area · Status Badge · Priority
- Actions: Bearbeiten, Status-Change (mit Transition-Validation), Pin/Unpin, Mehr (Portal, Email, DocuSign, Export, Archive)
- Daten aus `useMatterContext().caseData`

### MatterTabBar (`src/components/legal/matter-tab-bar.tsx`)

```typescript
const MATTER_TABS = [
  { key: "", label: "Overview", icon: FileText },
  { key: "documents", label: "Dokumente", icon: FolderOpen },
  { key: "deadlines", label: "Fristen", icon: CalendarClock },
  { key: "drafting", label: "Entwürfe", icon: PenTool },
  { key: "research", label: "Recherche", icon: Search },
  { key: "communications", label: "Kommunikation", icon: Mail },
  { key: "billing", label: "Abrechnung", icon: Receipt },
  { key: "activity", label: "Verlauf", icon: Activity },
  { key: "ai", label: "KI", icon: Sparkles },
];
```

- Aktiver Tab = URL-basiert (`usePathname()`)
- Badge-Counts: Deadlines (rot bei overdue), Documents (Anzahl), Activity (neue)
- Keyboard: `←` `→` Tab-Navigation

---

## 5. ADAPTIVE SIDEBAR

### Global Mode (nicht in Akte)

```
─── GLOBAL ─────────────
  Overview / Cases / Deadlines / Intake / Chat
─── SECTIONS ──────────
  Cases & Clients / Communication / Documents & Drafting
  Research & Knowledge / Operations / Billing & Compliance
─── PINNED MATTERS ────
  ★ Meier Erbrecht / ★ Schulz Scheidung
─── ADMIN ─────────────
  ...
```

### Matter Mode (in `/dashboard/cases/[slug]/*`)

```
─── MATTER ────────────
  [📁 Briefcase-Indikator]
  Müller vs. Schmidt (2026-001)
  ─────────────────────
  Overview / Documents / Deadlines / Drafting / Research
  Communications / Billing / Activity / AI
─── PINNED MATTERS ────
  ★ Meier Erbrecht / ★ Schulz Scheidung
─── GLOBAL ────────────
  Overview (alle) / Cases (alle) / Intake / Chat
```

### Implementierung

- `Sidebar` erhält `matterMode: boolean` (aus `usePathname()` Pattern-Match)
- `MATTER_NAV_ITEMS` in `src/lib/matter-nav.ts` — hrefs sind **relativ** zur Matter-Route
- Sidebar prependet Base-Path `/dashboard/cases/${slug}` für Matter-Items
- Pinned Matters Section: `useRecentMatters()` (bereits vorhanden), in beiden Modi
- Briefcase-Icon oben im Matter Mode (wie PracticePanther)

---

## 6. MATTER SWITCHER IN TOPBAR

### Position

Im Topbar, rechts neben Global Search, links von Notifications.

### Design

```
[📁 Müller vs. Schmidt ▾]
  ├─ Aktuelle Akte: Müller vs. Schmidt (2026-001)
  ├─ 📌 Pinned: Meier, Schulz
  ├─ 🕐 Recent: Weber (2h), Beck (1d), Hoffmann (3d)
  └─ [🔍 Akte suchen...]
```

### Implementierung

- Neue Komponente: `src/components/dashboard/matter-switcher.tsx`
- Nutzt `useRecentMatters()` (vorhanden) für Pinned/Recent
- Nutzt `useBrainSelector()` (vorhanden) für Search
- `usePathname()` erkennt aktuelle Akte
- Click → `router.push('/dashboard/cases/${slug}')`

---

## 7. MATTER STREAM (wie Rocket Matter)

### Position: Oben auf Overview Page

```
┌──────────────────────────────────────────────────────────────┐
│ 📋 Matter Stream                                             │
│ [Task] Frist Klageerwiderung erstellt — 2h                   │
│ [Doc]  Klageschrift.pdf hochgeladen — 4h                     │
│ [AI]   Widerspruchsscan: 2 Konflikte — 6h                    │
│ [Time] 1,5h Beratungsgespräch — 1d                           │
│ [Note] Mandant will Vergleich — 2d                           │
│ ──────────────────────────────────────────────────────────── │
│ [📎 Upload] [✍️ Note] [⏰ Frist] [💬 Chat]                   │
└──────────────────────────────────────────────────────────────┘
```

### Datenquellen (alle vorhanden)

- `caseData.timelineEvents`, `caseData.auditLog`, `caseData.documents`, `caseData.tasks`, `caseData.timeEntries`, `caseData.deadlines`
- Neue Komponente: `src/components/legal/matter-stream.tsx`
- Merged + sortiert nach Datum
- Realtime via `useRealtime()` (vorhanden)

---

## 8. MATTER-SCOPED QUICK CREATE

### Änderung

Dialoge erhalten optional `presetCaseSlug` prop → kein Case-Selector nötig.

| Dialog                       | Neue Prop                 |
| ---------------------------- | ------------------------- |
| `CaseQuickCreateDialog`      | `presetCaseSlug?: string` |
| `DeadlineQuickCreateDialog`  | `presetCaseSlug?: string` |
| `InvoiceQuickCreateDialog`   | `presetCaseSlug?: string` |
| `SignatureQuickCreateDialog` | `presetCaseSlug?: string` |
| `ContractQuickCreateDialog`  | `presetCaseSlug?: string` |
| `ClauseQuickCreateDialog`    | `presetCaseSlug?: string` |

### Keyboard Shortcuts (in Matter Workspace)

- `[N]` → Dokument-Upload für aktuelle Akte
- `[D]` → Frist für aktuelle Akte
- `[I]` → Rechnung für aktuelle Akte
- `[S]` → Signatur für aktuelle Akte
- `[C]` → Entwurf für aktuelle Akte

Außerhalb Matter Workspace: Quick Create zeigt Case-Selector (wie bisher).

---

## 9. COPILOT: MATTER-SCOPED BY DEFAULT

### Änderung an `copilot-sidebar.tsx`

Route-Pattern erweitern:

```typescript
// ALT: nur Case Detail
pattern: /^\/dashboard\/cases(?:\/(.+))?$/;

// NEU: alle Matter Sub-Routes
pattern: /^\/dashboard\/cases\/([^/]+(?:\/[^/]+)*)(?:\/(.+))?$/;
// m[1] = case slug, m[2] = sub-route
```

### Sub-Route-spezifische Quick Actions

- `/documents` → "Dokumente zusammenfassen", "Fehlende Dokumente"
- `/deadlines` → "Nächste Fristen", "Fristen-Berechnung"
- `/ai` → "Strategie-Analyse", "Widersprüche finden"
- `/billing` → "Aufwandszusammenfassung", "RVG-Kostenberechnung"

### ChatPanel

- In Matter Sub-Routes: `context.type = "case"` automatisch
- Kein Case-Selector (bereits `caseSelector: false` wenn caseSlug gesetzt)
- Chat-Sessions pro Akte persistiert (teilweise vorhanden)

---

## 10. SUB-PAGE SPEZIFIKATIONEN

### 10.1 Overview (`/`)

- Matter Stream (Activity Feed)
- CaseOverviewWidgets (vorhanden)
- Quick Actions Row (→ AI, Deadlines, Upload, Drafting)
- Parties Grid (Client, Opponent, Court, Lawyer)
- Evidence Summary + Financial Summary

### 10.2 Documents (`/documents`)

- Multi-file Drag-Drop Upload Zone
- Document List mit Type-Filter, Search, Sort
- Evidence Management (Beweismittel CRUD)
- Link Existing Document Dialog
- AI Evidence Cards (KI-extrahierte Fakten)
- **Code-Quelle**: Zeilen 2876-3425 + 4324-4535 aus altem `page.tsx`

### 10.3 Deadlines (`/deadlines`)

- Deadline CRUD (Add/Edit/Delete mit RHF + Zod)
- Deadline Calculator (DEADLINE_RULES, calculateDeadline)
- AI Deadline Detection (Text → Fristen-Vorschläge)
- Task List (Checkbox, Add, Delete)
- Comment Threads pro Deadline
- **Code-Quelle**: Zeilen 3428-4016 + 4018-4135 aus altem `page.tsx`

### 10.4 Drafting (`/drafting`)

- Template-Auswahl mit Case-Pre-fill (Titel, Parteien, Aktenzeichen)
- Bestehende Entwürfe dieser Akte
- Neuer Entwurf → öffnet Editor mit Case-Kontext
- **Neu**: Nutzt bestehende `/dashboard/drafting` Komponenten, aber mit `presetCaseSlug`

### 10.5 Research (`/research`)

- Recherche scoped to case facts (`caseData.facts` als Kontext)
- Verknüpfung mit bestehender `/dashboard/research` Engine
- Ergebnisse können direkt als Note/Document zur Akte hinzugefügt werden

### 10.6 Communications (`/communications`)

- beA-Nachrichten für diese Akte
- Email-Verlauf (aus `caseData.timelineEvents` gefiltert)
- WhatsApp-Verlauf
- Quick Compose (Email/beA mit Case-Referenz im Betreff)
- **Neu**: Nutzt `EmailComposeDialog` (vorhanden) mit `presetCaseSlug`

### 10.7 Billing (`/billing`)

- Time Entries CRUD (aus `caseData.timeEntries`)
- Expense Entries CRUD (aus `caseData.expenses`)
- RVG-Kostenberechnung (aus `src/lib/rvg.ts`)
- Invoice List für diese Akte
- Trust Account Transactions für diese Akte
- **Code-Quelle**: Aus `caseData.timeEntries`, `caseData.expenses` + bestehende Billing-Komponenten

### 10.8 Activity (`/activity`)

- Matter Stream (vollständig, alle Events)
- Audit Log (aus `caseData.auditLog`)
- Entity Graph (Parties, Claims, Evidence, Documents, Deadlines als Cards)
- Cited Norms (parseCitations aus `caseData.facts`)
- **Code-Quelle**: Zeilen 4138-4321 + 4997-5041 aus altem `page.tsx`

### 10.9 AI (`/ai`)

- MatterContextPanel (vorhanden — wird eingebettet)
- ChatPanel (vorhanden — mit `context.type = "case"`)
- PipelinePanel (vorhanden — Strategie-Generierung)
- Contradiction Probe (Semantic + Field-Level)
- Strategy Quick Actions
- **Code-Quelle**: Zeilen 4825-5101 aus altem `page.tsx`

---

## 11. CROSS-MATTER GLOBAL PAGES (bleiben erhalten)

| Global Page            | Zweck                           | Matter-Bezug                                           |
| ---------------------- | ------------------------------- | ------------------------------------------------------ |
| `/dashboard`           | Overview, Pinned Matters, Stats | Cross-Matter                                           |
| `/dashboard/cases`     | Alle Akten (Liste)              | Cross-Matter                                           |
| `/dashboard/deadlines` | Alle Fristen                    | Akten-Spalte + Deep-Link → `/cases/[slug]/deadlines`   |
| `/dashboard/vault`     | Alle Dokumente                  | Akten-Filter + Deep-Link → `/cases/[slug]/documents`   |
| `/dashboard/drafting`  | Alle Entwürfe                   | Akten-Zuordnung + Deep-Link → `/cases/[slug]/drafting` |
| `/dashboard/research`  | Globale Recherche               | Optional: Case-Bezug                                   |
| `/dashboard/bea`       | beA-Postfach                    | Akten-Verknüpfung                                      |
| `/dashboard/invoicing` | Alle Rechnungen                 | Akten-Filter                                           |
| `/dashboard/intake`    | Intake Requests                 | → Convert → Case                                       |

**Verbesserung**: Global Pages erhalten Akten-Spalte mit Deep-Links in Matter Workspace.

---

## 12. DATEI-ÜBERSICHT

### Neue Dateien (16)

| Datei                                                       | Zweck                | Zeilen (est.) |
| ----------------------------------------------------------- | -------------------- | ------------- |
| `src/app/dashboard/cases/[...slug]/layout.tsx`              | Matter Shell         | ~250          |
| `src/app/dashboard/cases/[...slug]/page.tsx`                | Overview (NEU)       | ~400          |
| `src/app/dashboard/cases/[...slug]/documents/page.tsx`      | Documents            | ~600          |
| `src/app/dashboard/cases/[...slug]/deadlines/page.tsx`      | Deadlines + Tasks    | ~500          |
| `src/app/dashboard/cases/[...slug]/drafting/page.tsx`       | Drafting             | ~300          |
| `src/app/dashboard/cases/[...slug]/research/page.tsx`       | Research             | ~250          |
| `src/app/dashboard/cases/[...slug]/communications/page.tsx` | Communications       | ~300          |
| `src/app/dashboard/cases/[...slug]/billing/page.tsx`        | Billing              | ~400          |
| `src/app/dashboard/cases/[...slug]/activity/page.tsx`       | Activity             | ~350          |
| `src/app/dashboard/cases/[...slug]/ai/page.tsx`             | AI                   | ~300          |
| `src/components/legal/matter-stream.tsx`                    | Activity Feed        | ~200          |
| `src/components/legal/matter-header.tsx`                    | Matter Header        | ~150          |
| `src/components/legal/matter-tab-bar.tsx`                   | Tab-Bar              | ~100          |
| `src/components/dashboard/matter-switcher.tsx`              | Topbar Switcher      | ~200          |
| `src/lib/matter-context.tsx`                                | DataProvider Context | ~80           |
| `src/lib/matter-nav.ts`                                     | Nav Items Definition | ~50           |

### Geänderte Dateien (12)

| Datei                                                 | Änderung                                 |
| ----------------------------------------------------- | ---------------------------------------- |
| `src/app/dashboard/cases/[...slug]/page.tsx`          | Wird ersetzt (Code in Sub-Pages)         |
| `src/components/dashboard/sidebar.tsx`                | Matter Mode + Pinned Matters + Briefcase |
| `src/components/dashboard/topbar.tsx`                 | Matter Switcher Dropdown                 |
| `src/components/chat/copilot-sidebar.tsx`             | Sub-Route Pattern + Quick Actions        |
| `src/app/dashboard/layout.tsx`                        | Optional: MatterDataProvider Wrapper     |
| `src/components/legal/CaseQuickCreateDialog.tsx`      | `presetCaseSlug` prop                    |
| `src/components/legal/DeadlineQuickCreateDialog.tsx`  | `presetCaseSlug` prop                    |
| `src/components/legal/InvoiceQuickCreateDialog.tsx`   | `presetCaseSlug` prop                    |
| `src/components/legal/SignatureQuickCreateDialog.tsx` | `presetCaseSlug` prop                    |
| `src/components/legal/ContractQuickCreateDialog.tsx`  | `presetCaseSlug` prop                    |
| `src/components/legal/ClauseQuickCreateDialog.tsx`    | `presetCaseSlug` prop                    |
| `src/content/dashboard.ts`                            | i18n Keys: `matter.*`                    |

### Unveränderte Dateien

- `src/lib/use-recent-matters.ts` — wird genutzt, keine Änderung
- `src/lib/legal-types.ts` — CaseDetail Interface bleibt
- `src/lib/case-status.ts` — Status-Logik bleibt
- `src/lib/legal-deadlines.ts` — Deadline-Logik bleibt
- `src/lib/intake-conversion.ts` — Intake Workflow bleibt
- `src/app/api/intake/*` — API Routes bleiben
- `src/components/legal/MatterContextPanel.tsx` — in AI Sub-Page eingebettet
- `src/components/legal/PipelinePanel.tsx` — in AI Sub-Page eingebettet
- `src/components/chat/chat-panel.tsx` — in AI Sub-Page + Copilot genutzt
- `src/components/dashboard/widget-dashboard.tsx` — Overview Widgets bleiben

---

## 13. IMPLEMENTIERUNGS-PHASEN

### Phase 1: Matter Sub-Routes + Layout (P0, 3-5 Tage)

1. `src/lib/matter-context.tsx` — MatterDataProvider
2. `src/lib/matter-nav.ts` — MATTER_TABS + MATTER_NAV_ITEMS
3. `src/app/dashboard/cases/[...slug]/layout.tsx` — Shell mit Header, Tab-Bar, Provider
4. `src/components/legal/matter-header.tsx`
5. `src/components/legal/matter-tab-bar.tsx`
6. Extrahiere Overview Page aus altem `page.tsx`
7. Extrahiere Documents Page
8. Extrahiere Deadlines Page
9. Extrahiere AI Page
10. Extrahiere Activity Page
11. Extrahiere Billing Page
12. Extrahiere Drafting, Research, Communications (neu oder Stub)

### Phase 2: Matter Switcher in Topbar (P0, 1 Tag)

1. `src/components/dashboard/matter-switcher.tsx`
2. Einbau in `topbar.tsx`

### Phase 3: Adaptive Sidebar (P0, 1-2 Tage)

1. `matterMode` prop in `Sidebar`
2. `MATTER_NAV_ITEMS` Rendering
3. Pinned Matters Section (beide Modi)
4. Briefcase-Indikator

### Phase 4: Matter-Scoped Quick Create (P1, 1 Tag)

1. `presetCaseSlug` prop an allen 6 Dialogen
2. Keyboard Shortcuts nutzen Active Matter aus URL

### Phase 5: Copilot Matter-Scoped (P1, 1-2 Tage)

1. Route-Pattern in `copilot-sidebar.tsx` erweitern
2. Sub-Route-spezifische Quick Actions
3. ChatPanel Context automatisch aus URL

### Phase 6: Matter Stream (P2, 1-2 Tage)

1. `src/components/legal/matter-stream.tsx`
2. Einbau in Overview Page
3. Realtime-Updates

### Phase 7: Cross-Matter Deep-Links (P2, 1 Tag)

1. Global Pages erhalten Akten-Spalte mit Deep-Links
2. `/dashboard/deadlines` → Link → `/cases/[slug]/deadlines`
3. `/dashboard/vault` → Link → `/cases/[slug]/documents`

### Phase 8: Edge Cases & Polish (P2, 1-2 Tage)

1. Ethical Wall Enforcement pro Sub-Route
2. Archived Case: Sub-Pages zeigen Read-Only
3. Loading States pro Sub-Page
4. Error Boundaries pro Sub-Page
5. Mobile: Tab-Bar horizontal scroll, Matter Switcher als Bottom-Sheet

---

## 14. EDGE CASES

| Scenario              | Lösung                                                               |
| --------------------- | -------------------------------------------------------------------- |
| Akte archiviert       | Sub-Pages zeigen Read-Only, Quick Create disabled                    |
| Ethical Wall verletzt | Sub-Route redirectet zu `/dashboard/cases` mit Error                 |
| Akte nicht gefunden   | `error.tsx` zeigt "Akte nicht gefunden" + Link zu Cases              |
| Offline               | Sub-Pages nutzen `useMutationQueue` (vorhanden)                      |
| Mobile                | Tab-Bar horizontal scrollbar, Matter Switcher als Bottom-Sheet       |
| Tax-Industry          | Matter Sub-Routes für Tax-Cases (gleiche Architektur, andere Labels) |
| Deep-Link von extern  | URL funktioniert direkt (z.B. `/cases/2026-001-mueller/deadlines`)   |

---

## 15. ERWEITERUNGEN DURCH DEEP RESEARCH v3.0

### 15.1 Matter Templates / Practice-Area Workflows (Clio, Filevine, Smokeball, CaseQube)

**Problem**: Neue Akten werden "leer" erstellt — keine Tasks, keine Fristen, keine Dokument-Checklisten.

**Industry Standard**: Alle führenden Plattformen haben Matter Templates pro Rechtsgebiet:

- Clio: Matter Templates mit Task Lists, Document Checklists, Custom Fields pro Practice Area
- Filevine: "Project Types" — konfigurierbare Sections, Vitals, Phases, Taskflows
- Smokeball: Matter Templates mit automatischen Workflows pro Practice Area
- CaseQube: 15-60 Templates pro Firma, auto-generiert 22-40 Tasks bei Erstellung

**Lösung**: `src/lib/matter-templates.ts` mit Task Blueprints, Deadline Blueprints, Document Checklists, Folder Structure, Vitals und Phases pro Practice Area. Bei Akten-Erstellung → Template-Auswahl → Auto-Generierung. Phase-Change triggert neue Tasks (wie Clio Automated Workflows).

**Aufwand**: ~3-4 Tage

### 15.2 Document Matrix / Evidence Grid (Vaquill, CreateOS, Syllo)

**Problem**: Chat behandelt Dokumente einzeln. Bei 50+ Beweisdokumenten verliert der Anwalt den Überblick.

**Industry Standard (Vaquill)**: _"A Document Matrix extracts structured fields across all of them at once into a tabular grid [...] the thing a chat interface structurally cannot give you."_

**Lösung**: Tabular Grid View im Documents Tab. Spalten: Dokument | Datum | Parteien | Zitierte Normen | Key Facts | Beweiswert. AI Bulk-Extraction across all docs. Exportierbar CSV/PDF. Wir haben bereits `aiEvidenceCards` — muss als Grid gerendert werden.

**Aufwand**: ~2 Tage

### 15.3 AI Chronology Builder (Vaquill, Juristic, Syllo, CreateOS)

**Problem**: Timeline wird manuell gepflegt.

**Industry Standard**: AI extrahiert automatisch Dates/Events aus allen Dokumenten → strukturierte Chronologie mit Source-Links.

**Lösung**: AI parst alle Akten-Dokumente → extrahiert datierte Events → jeder Event verlinkt zum Source-Dokument. Filterbar nach Partei, Issue, Date Range. Export PDF/CSV. Wir haben bereits `timelineEvents` — was fehlt ist AI-Extraction-Pipeline.

**Aufwand**: ~3-4 Tage

### 15.4 Matter Memory / Persistent Context (Harvey, Vaquill)

**Problem**: Chat-Sessions sind stateless. Anwalt muss jede Woche neu erklären.

**Industry Standard (Harvey)**: _"Memory will carry forward the context you choose — matter details, relevant precedent, working preferences."_
**Industry Standard (Vaquill)**: _"Does it remember the matter between sessions, or do I re-explain every Monday?"_

**Lösung**: `src/lib/matter-memory.ts` — persistenter State pro Akte (summary, keyFacts, strategyNotes, openIssues). Wird automatisch in jeden System-Prompt eingespeist. Admin kann Memory an/aus schalten.

**Aufwand**: ~2-3 Tage

### 15.5 Vitals / Key Fields at-a-glance (Filevine)

**Problem**: Wichtige Akten-Daten (Verjährung, nächster Termin, offene Tasks) sind in Sub-Tabs verstreut.

**Industry Standard (Filevine)**: "Vitals" — bis zu 15 Key Fields, immer oben im Matter sichtbar, konfigurierbar pro Project Type.

**Lösung**: Vitals Bar im MatterHeader unter Title/Status:

```
[Verjährung: 31.12.2026] [Nächster Termin: 15.07.] [Offene Tasks: 7] [Aufwand: 4.250€]
```

Konfigurierbar pro Practice Area. **Aufwand**: ~1 Tag

### 15.6 Phase-Based Workflow Triggers (Clio, Filevine, CaseQube)

**Problem**: Status-Wechsel macht nichts außer ein Label ändern.

**Industry Standard**: Phase-Change → automatische Task-Generierung, Document-Generierung, Notifications.

**Lösung**: Matter Phases (`intake → evaluation → investigation → negotiation → litigation → trial → settlement → closed`). Phase-Change triggert Tasks/Docs. Wir haben bereits `caseData.status` mit Transition-Validation — was fehlt ist Trigger-System. **Aufwand**: ~2-3 Tage

### 15.7 Three-Level Folder Structure (Clio, LexWorkplace, Vaquill)

**Problem**: Dokumente in der Akte sind eine flache Liste.

**Industry Standard**: Client → Matter → Document Type (00_Aktenverwaltung, 01_Korrespondenz, 02_Schriftsätze, 03_Beweise, etc.)

**Lösung**: Folder-Tree links im Documents Tab, Template-generiert bei Akten-Erstellung. "07_Privilegiert" mit Ethical Wall Enforcement. **Aufwand**: ~2 Tage

### 15.8 Laws of UX Anwendung

| Gesetz                   | Anwendung                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hick's Law**           | Matter Mode Sidebar: 9 Items vs 60+ Global → drastisch weniger Entscheidungszeit                                                                                                      |
| **Miller's Law**         | 7±2 Items Working Memory. 9 Tabs an oberer Grenze → **Primäre Tabs** (Overview, Docs, Deadlines, AI) + **Secondary Tabs** (Drafting, Research, Comms, Billing, Activity) in 2 Gruppen |
| **Jakob's Law**          | Matter-centric ist jetzt Industry Standard → Users expect it                                                                                                                          |
| **Cognitive Load**       | Matter Switcher + Pinned Matters reduziert Context-Switching                                                                                                                          |
| **Zeigarnik Effect**     | Offene Tasks/Fristen in Vitals Bar sichtbar                                                                                                                                           |
| **Goal-Gradient Effect** | Phase-Progress-Indicator zeigt Fortschritt → Motivation                                                                                                                               |
| **Doherty Threshold**    | MatterDataProvider lädt einmal → Tab-Wechsel < 400ms = instant                                                                                                                        |

### 15.9 Phase-Progress-Indicator (Neu durch UX Research)

Horizontale Phase-Bar im MatterHeader:

```
[Intake]──[Evaluation]──[Investigation]──●[Litigation]──[Trial]──[Settlement]
```

Click auf Phase → Status-Change mit Trigger. **Aufwand**: ~0.5 Tage

### 15.10 "Fail Closed" Ethical Wall (Harvey AI)

**Industry Standard (Harvey)**: _"The system 'fails closed' rather than open. If an agent can't confirm a document falls within its authorized boundary, it skips that document."_

**Lösung**: Matter Layout prüft Ethical Wall bei Mount. Bei Fehler/Unklar → Redirect + Error. Audit-Logging pro Sub-Route. Wir haben bereits `ethical-wall.ts`. **Aufwand**: ~1 Tag

### 15.11 Matter als Billing/Metering Boundary (Vaquill)

**Industry Standard (Vaquill)**: _"A matter workspace is the natural billing and metering boundary. You are not paying to re-process your whole document store on every question."_

**Lösung**: AI-Aufrufe pro `caseSlug` metered. Pro-Matter Cost-Display im Billing Tab. Wir haben bereits `quota.ts`. **Aufwand**: ~1 Tag

---

## 16. AKTUALISIERTE SUB-PAGES (v3.0 Änderungen)

| Sub-Page  | Neu in v3.0                                            |
| --------- | ------------------------------------------------------ |
| Overview  | Vitals Bar, Phase-Progress-Indicator                   |
| Documents | Folder-Tree (3-Level), Evidence Grid (Document Matrix) |
| Deadlines | Template-generierte Tasks, Phase-Triggered Tasks       |
| Activity  | AI Chronology Builder (auto-extraction aus Docs)       |
| AI        | Matter Memory Panel, Pro-Matter AI Usage Stats         |
| Billing   | AI-Kosten pro Akte (Token-Usage, Cost-Summary)         |

---

## 17. ZUSÄTZLICHE NEUE DATEIEN (v3.0)

| Datei                                          | Zweck                        | Zeilen (est.) |
| ---------------------------------------------- | ---------------------------- | ------------- |
| `src/lib/matter-templates.ts`                  | Templates pro Practice Area  | ~400          |
| `src/lib/matter-memory.ts`                     | Persistent Matter Memory     | ~150          |
| `src/lib/matter-phases.ts`                     | Phase Definitionen + Trigger | ~200          |
| `src/components/legal/vitals-bar.tsx`          | Key Fields at-a-glance       | ~120          |
| `src/components/legal/phase-progress.tsx`      | Lifecycle Indicator          | ~80           |
| `src/components/legal/evidence-grid.tsx`       | Document Matrix View         | ~250          |
| `src/components/legal/chronology-builder.tsx`  | AI Chronology                | ~300          |
| `src/components/legal/folder-tree.tsx`         | 3-Level Folder Nav           | ~200          |
| `src/components/legal/matter-memory-panel.tsx` | Memory Editor                | ~150          |
| `src/app/api/matter-memory/route.ts`           | Memory CRUD API              | ~100          |

---

## 18. AKTUALISIERTE PHASEN (v3.0)

| Phase | Inhalt                                       | Priorität | Tage |
| ----- | -------------------------------------------- | --------- | ---- |
| 1     | Matter Sub-Routes + Layout                   | P0        | 3-5  |
| 2     | Matter Switcher in Topbar                    | P0        | 1    |
| 3     | Adaptive Sidebar                             | P0        | 1-2  |
| 4     | **Vitals Bar + Phase-Progress** (NEU)        | P0        | 1.5  |
| 5     | Matter-Scoped Quick Create                   | P1        | 1    |
| 6     | **Copilot + Matter Memory** (ERWEITERT)      | P1        | 2-3  |
| 7     | **Matter Templates + Phase Triggers** (NEU)  | P1        | 3-4  |
| 8     | **Folder Structure + Evidence Grid** (NEU)   | P2        | 3-4  |
| 9     | **AI Chronology Builder** (NEU)              | P2        | 3-4  |
| 10    | Matter Stream                                | P2        | 1-2  |
| 11    | Cross-Matter Deep-Links                      | P2        | 1    |
| 12    | **Ethical Wall "Fail Closed" + Audit** (NEU) | P2        | 1    |
| 13    | Edge Cases & Polish                          | P2        | 1-2  |

**Gesamt v3.0**: ~22-32 Tage (v2.0 war ~12-17 Tage)

---

## 19. DEFINITION OF DONE (v3.0)

### Core (v2.0)

- [ ] 9 Matter Sub-Routes funktional
- [ ] MatterDataProvider teilt State
- [ ] Tab-Bar URL-basiert
- [ ] Sidebar Matter Mode + Briefcase
- [ ] Pinned Matters in Sidebar
- [ ] Matter Switcher in Topbar
- [ ] Quick Create mit `presetCaseSlug`
- [ ] Copilot matter-scoped
- [ ] Matter Stream
- [ ] Cross-Matter Deep-Links

### Neu in v3.0

- [ ] Vitals Bar im MatterHeader
- [ ] Phase-Progress-Indicator
- [ ] Matter Templates pro Practice Area (min. 3: Familienrecht, Strafrecht, Zivilrecht)
- [ ] Phase-Change triggert Tasks/Docs
- [ ] Folder-Tree (3-Level) im Documents Tab
- [ ] Evidence Grid (Document Matrix) mit AI Bulk-Extraction
- [ ] AI Chronology Builder mit Source-Links
- [ ] Matter Memory in System-Prompt
- [ ] Matter Memory Panel in AI Tab
- [ ] Ethical Wall "Fail Closed" in Layout
- [ ] Pro-Matter AI Usage Tracking im Billing Tab

### Quality

- [ ] TypeScript: 0 Errors
- [ ] Tests: Alle bestehenden + neue
- [ ] Build: erfolgreich
- [ ] Mobile: Tab-Bar scrollbar, Switcher als Bottom-Sheet
- [ ] Archived Cases: Sub-Pages Read-Only

---

## 20. DEEP RESEARCH v3.1 — 8 FEHLENDE BEREICHE

### 20.1 In-Matter Search (iManage Insight+, NetDocuments, DeepJudge, Casero)

**Problem**: In der Akte gibt es keine Suchleiste um **innerhalb** der Akte zu suchen. Der Anwalt muss manuell durch Dokumente scrollen.

**Industry Standard**:

- iManage Insight+: "Surface relevant documents using context-driven discovery based on 100+ metadata fields"
- NetDocuments Smart Answers: "Ask questions in natural language, get answers grounded in firm's document repository with citations"
- DeepJudge: "Semantic search — search the way you think, accurate content-focused results"
- Casero: "Semantic search lets lawyers ask questions in plain English"

**Was wir haben**:

- `SearchResult.case_slug` Feld existiert (server/src/core/types.ts:726)
- `permission-retrieval.test.ts` testet matter-scoped search filtering
- Hybrid Search Engine (RRF) in `server/src/core/search/hybrid.ts` — full keyword + vector search
- Aber: **keine UI** für in-matter search im Case Detail Page

**Lösung**:

- **Matter Search Bar** im MatterHeader oder als eigener Tab:

```
[🔍 In dieser Akte suchen...]
  → "Welche Dokumente erwähnen § 823 BGB?"
  → "Alle Schriftsätze von Gegenseite"
  → "Fristen im Juli 2026"
```

- Nutzt bestehende Hybrid Search Engine mit `case_slug` Filter
- Ergebnisse mit Source-Link zum Dokument
- Natural Language Queries (wie DeepJudge/Casero)
- **Aufwand**: ~2 Tage (UI + API-Endpoint mit case_slug Filter)

### 20.2 Cross-Matter Intelligence / Similar Matters (Casero, DeepJudge SuperSearch, LegalAI Space)

**Problem**: Die Firma hat jahrelange Erfahrung, aber sie ist nicht zugänglich. Neue Akten starten von Null.

**Industry Standard**:

- Casero: "Automatically surfaces past matters relevant to a new one, based on legislation, factual circumstances, and case classification. Multi-dimensional score explaining why each past case matched."
- DeepJudge SuperSearch: "Cross-matter intelligence — ask complex cross-matter questions and receive insights across matters"
- LegalAI Space: "Proactive recommendations when new matters match existing firm expertise"

**Lösung**:

- **Similar Matters Panel** auf Matter Overview:

```
┌──────────────────────────────────────────────────────┐
│ 📊 Ähnliche Akten                                     │
│ ──────────────────────────────────────────────────── │
│ [88%] Meier vs. Bauer (2025-042)                    │
│   Familienrecht · Scheidung · Versorgungsausgleich  │
│   → Strategie: Vergleich empfohlen, angenommen      │
│ [76%] Schulz vs. Hofmann (2024-018)                 │
│   Familienrecht · Trennungsunterhalt                │
│   → Strategie: Stufenklage erfolgreich              │
│ [65%] Beck vs. Wagner (2025-007)                    │
│   Familienrecht · Sorgerecht                        │
│   → Strategie: Mediation, dann Gericht              │
└──────────────────────────────────────────────────────┘
```

- AI vergleicht Practice Area, Legal Issues, Parties, Facts
- Multi-dimensional similarity score
- Link zu past matter + Strategy Summary
- Ethical Wall: nur matters ohne conflict
- **Aufwand**: ~3-4 Tage (AI Pipeline + UI + API)

### 20.3 Knowledge Graph / Entity Map (NetDocuments Context Graph, Casero, JudicialMind)

**Problem**: Beziehungen zwischen Parteien, Dokumenten, Fristen, Normen sind nicht visualisiert.

**Industry Standard**:

- NetDocuments: "Legal Context Graph — continuously maps relationships among every matter, document, communication and person"
- Casero: "Knowledge graph maps every entity — people, organisations, dates, obligations, events. Every node traces back to source document."
- JudicialMind: "See the law as a living network where statutes, cases, clauses, parties, and obligations are all linked in a navigable graph"

**Was wir haben**:

- `src/lib/legal-graph/schema.ts` — PostgreSQL schema für judgements + chunks + citations
- `src/lib/legal-graph/citations.ts` — citation extraction
- `src/lib/legal-graph/search.ts` — graph search
- Entity Graph im Activity Tab (bereits vorhanden, aber basic)
- `parseCitations` für Normen-Extraktion

**Lösung**:

- **Matter Knowledge Graph** im Activity Tab (erweitert):
  - Nodes: Parteien, Dokumente, Fristen, Normen, Ansprüche, Beweise
  - Edges: "citates", "filed_by", "due_on", "evidenced_by", "conflicts_with"
  - Interactive: Click auf Node → Detail Panel
  - Auto-updated wenn neue Dokumente/Events hinzukommen
  - Source-Links: jeder Node verlinkt zum Source-Dokument
- **Aufwand**: ~3-4 Tage (Graph Builder + Interactive UI)

### 20.4 Document Versioning / Redline Comparison (LawVu + Litera Compare, Hyperstart)

**Problem**: Keine Versionierung von Dokumenten. Bei Änderungen weiss der Anwalt nicht, was sich geändert hat.

**Industry Standard**:

- LawVu + Litera Compare: "Compare documents — original and modified — to produce a redline document"
- Hyperstart: "Structured workspaces maintain one canonical draft while preserving every redline and comment throughout negotiation"

**Lösung**:

- **Document Version History** im Documents Tab:
  - Jeder Upload/Edit erstellt eine Version
  - Side-by-side Vergleich (Redline View)
  - Wer hat was geändert, wann, warum
  - Restore zu früherer Version
  - Comment Threads pro Version
- **Aufwand**: ~3-4 Tage (Versioning Backend + Diff UI)

### 20.5 Offline Read-Write mit Conflict Resolution (Align, Daylite, NetDocuments ndSync)

**Problem**: Im Gericht (kein WLAN) kann der Anwalt nicht arbeiten. Bei Sync-Konflikten gehen Daten verloren.

**Industry Standard**:

- Align (Mai 2026): "Offline Read-Write Mode for iPad — full edit capabilities while disconnected, automatic sync, intelligent conflict detection and resolution workflows"
- Daylite: "Work offline in court, syncing when back online"
- NetDocuments ndSync: "Two-way file-syncing, offline access, cloud and local copy up-to-date upon reconnection"

**Was wir haben**:

- `useMutationQueue` — offline mutation queue (vorhanden)
- `offlinePendingCount`, `offlineSyncing` state (vorhanden)
- Aber: **keine conflict resolution** bei multi-user offline edits

**Lösung**:

- **Offline-First Matter Workspace**:
  - Case-Daten werden lokal gecached (Service Worker / IndexedDB)
  - Edits werden queued (`useMutationQueue` erweitert)
  - Bei Reconnect: automatischer Sync
  - **Conflict Resolution UI**: bei Konflikt → "Compare versions, preserve edits, save alternate copies, or merge"
  - Sync-Status-Indikator im MatterHeader
- **Aufwand**: ~3-4 Tage (Service Worker + Conflict Resolution UI)

### 20.6 Matter Team / Role Assignment (Clio, Filevine, PracticePanther)

**Problem**: Keine explizite Team-Zuweisung für eine Akte. Wer ist verantwortlich? Wer ist Paralegal?

**Industry Standard**:

- Clio: "responsible_attorney, originating_attorney, responsible_staff" als Pflichtfelder
- Filevine: "Project Members" mit Rollen
- PracticePanther: "Assign tasks to specific team members"

**Was wir haben**:

- `userRole` und `currentUserName` in CaseDetail
- `ownLawyerName`, `ownLawyerSlug` in caseData
- Aber: **kein Matter Team** mit multiplen Rollen

**Lösung**:

- **Matter Team Panel** im MatterHeader oder Overview:

```
┌──────────────────────────────────────────────────────┐
│ 👥 Matter Team                                       │
│ ┌─────────────┬──────────────┬─────────────┐        │
│ │ Verantw.    │ Ursprüngl.   │ Paralegal   │        │
│ │ Rechtsanw.  │ Rechtsanw.   │             │        │
│ │ Dr. Müller  │ Dr. Schmidt  │ Frau Weber  │        │
│ └─────────────┴──────────────┴─────────────┘        │
│ [+ Mitglied hinzufügen]                             │
└──────────────────────────────────────────────────────┘
```

- Rollen: Responsible Attorney, Originating Attorney, Paralegal, Associate, Expert
- Tasks werden automatisch an Rolle zugewiesen (wie CaseQube: "not Joe, but the paralegal assigned to immigration matters")
- Permission-basiert: nur Team-Mitglieder können Akte bearbeiten
- **Aufwand**: ~2 Tage (UI + Backend für Team Assignment)

### 20.7 Smart Notifications / Tiered Escalation (JusticeAccelerator, CaseQube, Clio)

**Problem**: Alle Notifications sind gleichwertig. Dringende Fristen gehen unter.

**Industry Standard**:

- JusticeAccelerator: "Automate escalation of unattended notifications to appropriate stakeholders"
- CaseQube: "Tiered escalation — task overdue (24h) → escalate to supervising attorney, send notification"
- Clio: "Automated workflows combine tasks and document templates with matter stages"

**Was wir haben**:

- Notifications im Topbar (vorhanden)
- `deadline.urgency` Feld (vorhanden: overdue, urgent, normal)
- Aber: **keine tiered escalation**, keine priority-based filtering

**Lösung**:

- **Smart Notification System**:
  - Priority Levels: Critical (Frist in 24h), High (in 3 Tagen), Medium (in 7 Tagen), Low
  - Escalation Rules:
    - Critical + 24h unread → Escalate to Supervising Attorney
    - High + 48h unread → Escalate to Partner
    - Task overdue → Auto-reassign + Notify
  - Matter-Scoped Notifications: nur Notifications für Akten des Users
  - Notification Center mit Filter (by Matter, by Priority, by Type)
  - **Aufwand**: ~2-3 Tage (Backend + UI)

### 20.8 Proactive AI Recommendations (Clio Work / Vincent AI, LegalAI Space)

**Problem**: AI reagiert nur auf Anfragen. Sie proaktiviert nicht — schlägt keine nächsten Schritte vor.

**Industry Standard**:

- Clio Work: "Identifies proactive next steps specific to your matter, and drafts them in advance for your review"
- LegalAI Space: "The agent doesn't wait for you to search. When a new matter context matches existing firm expertise, relevant knowledge is surfaced proactively"
- Harvey: "Matter OS — pre-assembled environment where vaults, precedents, workflows are already connected"

**Lösung**:

- **Proactive Recommendations Panel** auf Matter Overview:

```
┌──────────────────────────────────────────────────────┐
│ 🤖 KI-Empfehlungen                                   │
│ ──────────────────────────────────────────────────── │
│ ⚠️ Frist Klageerwiderung in 5 Tagen                 │
│    → Entwurf vorbereiten? [Jetzt generieren]        │
│ 📄 Beweis: Urkunde vom 15.03. fehlt                 │
│    → Dokumentenanfrage senden? [Anfrage erstellen]  │
│ ⚖️ Ähnliche Akte: Meier (2025-042)                  │
│    → Strategie war erfolgreich: Vergleich            │
│    → [Strategie übernehmen]                         │
│ 📊 Aufwand: 4.250€, Budget: 5.000€                  │
│    → 85% ausgeschöpft — Budget-Review empfohlen     │
│ 🔄 Keine Aktivität seit 3 Tagen                     │
│    → Status-Update an Mandant senden? [Entwerfen]   │
└──────────────────────────────────────────────────────┘
```

- AI analysiert caseData kontinuierlich:
  - Fristen approaching → Draft vorbereiten
  - Missing documents → Anfrage vorschlagen
  - Similar matters → Strategy reuse
  - Budget tracking → Alerts
  - Inactivity → Status-Update vorschlagen
- **Proactive**: wird beim Öffnen der Akte angezeigt, nicht erst auf Anfrage
- **Actionable**: jeder Vorschlag hat einen Action-Button
- **Dismissible**: Anwalt kann Vorschläge dismissen
- **Aufwand**: ~3-4 Tage (AI Logic + UI + API)

---

## 21. AKTUALISIERTE SUB-PAGES (v3.1)

| Sub-Page       | Neu in v3.1                                                                            |
| -------------- | -------------------------------------------------------------------------------------- |
| Overview       | In-Matter Search Bar, Proactive AI Recommendations, Similar Matters Panel, Matter Team |
| Documents      | Document Versioning / Redline Comparison                                               |
| Activity       | Matter Knowledge Graph (interactive)                                                   |
| Alle Sub-Pages | Offline Read-Write mit Conflict Resolution, Smart Notifications                        |

---

## 22. ZUSÄTZLICHE NEUE DATEIEN (v3.1)

| Datei                                                | Zweck                              | Zeilen (est.) |
| ---------------------------------------------------- | ---------------------------------- | ------------- |
| `src/components/legal/matter-search.tsx`             | In-Matter Search Bar + Results     | ~200          |
| `src/components/legal/similar-matters.tsx`           | Cross-Matter Similarity Panel      | ~200          |
| `src/components/legal/knowledge-graph.tsx`           | Interactive Entity Graph           | ~350          |
| `src/components/legal/document-version-history.tsx`  | Versioning + Redline               | ~300          |
| `src/components/legal/matter-team.tsx`               | Team Assignment Panel              | ~150          |
| `src/components/legal/proactive-recommendations.tsx` | AI Next-Steps Panel                | ~250          |
| `src/components/legal/smart-notifications.tsx`       | Notification Center mit Escalation | ~200          |
| `src/components/legal/offline-sync-indicator.tsx`    | Sync Status + Conflict Resolution  | ~150          |
| `src/lib/similar-matters.ts`                         | Similarity Matching Logic          | ~200          |
| `src/lib/matter-knowledge-graph.ts`                  | Entity Extraction + Graph Builder  | ~250          |
| `src/lib/document-versioning.ts`                     | Version Tracking + Diff            | ~200          |
| `src/lib/smart-notifications.ts`                     | Escalation Rules Engine            | ~150          |
| `src/lib/proactive-recommendations.ts`               | Recommendation Engine              | ~200          |
| `src/app/api/matter-search/route.ts`                 | In-Matter Search API               | ~80           |
| `src/app/api/similar-matters/route.ts`               | Similar Matters API                | ~100          |
| `src/app/api/matter-team/route.ts`                   | Team Assignment API                | ~100          |

---

## 23. AKTUALISIERTE PHASEN (v3.1)

| Phase | Inhalt                                                | Priorität | Tage  |
| ----- | ----------------------------------------------------- | --------- | ----- |
| 1-13  | (wie v3.0)                                            | P0-P2     | 22-32 |
| 14    | **In-Matter Search** (NEU)                            | P1        | 2     |
| 15    | **Proactive AI Recommendations** (NEU)                | P1        | 3-4   |
| 16    | **Matter Team / Role Assignment** (NEU)               | P1        | 2     |
| 17    | **Smart Notifications + Escalation** (NEU)            | P1        | 2-3   |
| 18    | **Similar Matters / Cross-Matter Intelligence** (NEU) | P2        | 3-4   |
| 19    | **Matter Knowledge Graph** (NEU)                      | P2        | 3-4   |
| 20    | **Document Versioning / Redline** (NEU)               | P2        | 3-4   |
| 21    | **Offline Read-Write + Conflict Resolution** (NEU)    | P2        | 3-4   |

**Gesamt v3.1**: ~40-55 Tage

---

## 24. VORHANDENE INFRASTRUKTUR (nicht neu bauen)

| Feature                 | Vorhanden in                                                                                    | Was fehlt                            |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| Hybrid Search Engine    | `server/src/core/search/hybrid.ts`                                                              | UI für in-matter search              |
| case_slug Search Filter | `SearchResult.case_slug`, `permission-retrieval.test.ts`                                        | API-Endpoint + UI                    |
| Client Portal           | `portal-token.ts`, `portal/case/route.ts`, `portal/upload/route.ts`, `portal/messages/route.ts` | Integration in Matter Workspace      |
| Document Requests       | `api/document-requests` mit case_slug                                                           | UI in Matter Documents Tab           |
| Shared Spaces           | `api/shared-spaces`                                                                             | Integration in Matter                |
| Offline Mutation Queue  | `useMutationQueue`                                                                              | Conflict Resolution UI               |
| Legal Graph Schema      | `legal-graph/schema.ts`, `citations.ts`, `search.ts`                                            | Per-Matter Entity Graph              |
| Entity Graph (basic)    | In Activity Tab vorhanden                                                                       | Interactive Knowledge Graph          |
| Notifications           | Topbar notifications                                                                            | Smart escalation, priority filtering |
| Audit Log               | `caseData.auditLog`                                                                             | Pro-Sub-Route logging                |
| Ethical Walls           | `ethical-wall.ts`                                                                               | "Fail Closed" in Layout              |
| Quota System            | `quota.ts`                                                                                      | Pro-Matter tracking                  |

---

## 25. DEFINITION OF DONE (v3.1 — vollständig)

### Core Architecture

- [ ] 9 Matter Sub-Routes funktional
- [ ] MatterDataProvider teilt State
- [ ] Tab-Bar URL-basiert (Primär/Sekundär Gruppen per Miller's Law)
- [ ] Sidebar Matter Mode + Briefcase
- [ ] Pinned Matters in Sidebar
- [ ] Matter Switcher in Topbar
- [ ] Quick Create mit `presetCaseSlug`
- [ ] Copilot matter-scoped
- [ ] Matter Stream
- [ ] Cross-Matter Deep-Links

### Matter Intelligence (v3.0)

- [ ] Vitals Bar im MatterHeader
- [ ] Phase-Progress-Indicator
- [ ] Matter Templates pro Practice Area (min. 3)
- [ ] Phase-Change triggert Tasks/Docs
- [ ] Folder-Tree (3-Level) im Documents Tab
- [ ] Evidence Grid (Document Matrix)
- [ ] AI Chronology Builder
- [ ] Matter Memory in System-Prompt
- [ ] Ethical Wall "Fail Closed"
- [ ] Pro-Matter AI Usage Tracking

### Matter Intelligence (v3.1 NEU)

- [ ] In-Matter Search Bar (nutzt Hybrid Search + case_slug Filter)
- [ ] Proactive AI Recommendations auf Overview
- [ ] Matter Team mit Rollen (Responsible, Originating, Paralegal)
- [ ] Smart Notifications mit Tiered Escalation
- [ ] Similar Matters Panel (Cross-Matter Intelligence)
- [ ] Interactive Matter Knowledge Graph
- [ ] Document Versioning / Redline Comparison
- [ ] Offline Read-Write mit Conflict Resolution

### Quality

- [ ] TypeScript: 0 Errors
- [ ] Tests: Alle bestehenden + neue
- [ ] Build: erfolgreich
- [ ] Mobile: Tab-Bar scrollbar, Switcher als Bottom-Sheet
- [ ] Archived Cases: Sub-Pages Read-Only
- [ ] Client Portal in Matter Workspace integriert

---

## 26. DEEP RESEARCH v3.2 — FINALE 3 BEREICHE

### 26.1 Automated Matter Intake Pipeline (Caddi, Chronexa, MatterReady, Zenphi)

**Problem**: Intake → Akte ist ein manueller Mehrschritt-Prozess. Conflict Check, Engagement Letter, Team Assignment, Folder Creation — alles manuell.

**Industry Standard**:

- Caddi: "Reads intake form, runs conflicts and KYC checks, creates client/matter in system of record — minutes instead of days"
- Chronexa: "Single data capture, automated conflict search, cleared matters open automatically in DMS"
- MatterReady: "Scores every matter for readiness, conflict signals surface before engagement, missing info triggers automated follow-up"
- Zenphi: "AI reads incoming matter request, extracts details, classifies practice area, routes to right attorney, generates engagement letter, sends client acknowledgment"

**Was wir haben**:

- `src/lib/intake.ts` — Intake CRUD mit `conflict_check_status` Feld (pending/clear/conflict/needs_review)
- `src/lib/intake-conversion.ts` — `buildCaseFromIntake()` konvertiert Intake → Case
- `/api/intake/convert` — API Route für Conversion
- `/api/legal/conflict-check` — Conflict Check API (proxy to engine)
- Intake Dashboard mit Status-Filtern (new → needs_info → conflict_check → accepted → rejected → converted)
- **Aber**: Alles manuell. Keine automatische Pipeline.

**Lösung**: `src/lib/matter-intake-pipeline.ts`

```
Intake erstellt
  ↓
[1] AI klassifiziert: Practice Area, Urgency, Matter Type
  ↓
[2] Automated Conflict Check → fuzzy matching across all parties
  ↓
[3] Wenn clear → Engagement Letter aus Template generieren
  ↓
[4] Team Assignment basierend auf Practice Area + Workload
  ↓
[5] Folder Structure aus Matter Template erstellen
  ↓
[6] Welcome Packet an Mandant senden (Portal-Link, Termine, Kontakt)
  ↓
[7] Matter Template Tasks/Deadlines auto-generieren
  ↓
[8] Intake Status → "converted", Case Status → "open"
```

- Jeder Step ist audit-logged
- Exceptions (conflict, missing info) → route to human
- **Aufwand**: ~3-4 Tage (Pipeline + AI Classification + Template Merge)

### 26.2 Passive Time Tracking / AutoTime (Smokeball, Rize, Actionstep Trace, Traced)

**Problem**: Anwälte vergessen 10-30% ihrer billable Stunden. Manuelle Timer sind unbeliebt.

**Industry Standard**:

- Smokeball AutoTime: "Runs in the background — no start/stop timers. Knows which matter you're working on and records time automatically"
- Rize: "Tracks billable time by matter in the background. Detects which matter based on documents, emails, and tools open. At end of day, attorneys review and approve pre-filled entries"
- Actionstep Trace (Jan 2026): "Passive AI-enabled activity capture — automatically detects work across Outlook, Word, PDFs. AI-powered matter mapping. AI-generated narratives"
- Traced: "Automatically tracks attorney work activity, capturing billable hours completely in the background. AI-generated narratives, client & matter auto-fill"

**Was wir haben**:

- `src/lib/time-tracking.ts` — vollständige CRUD-Logik, Billing Summary, Filter
- `/api/time` — API mit case_slug scoping, billing summary, bulk mark-billed
- Mobile Timer Page (`/mobile/time`) — Start/Stop Timer, Manual Entry
- `TimeEntry` mit `activity_type` (research, drafting, court, meeting, other)
- `TimeEntryWithCase` mit `case_slug` linking
- **Aber**: Alles manuell. Keine passive Erfassung. Kein Background-Tracking.

**Lösung**: `src/lib/passive-time-capture.ts`

- **Matter Activity Tracker** (Browser Extension / Service Worker):
  - Erkennt aktive Akte basierend auf URL (`/dashboard/cases/[slug]/...`)
  - Trackt Zeit pro Akte automatisch
  - Activity Types: document_edit, chat_session, research, email_draft
- **Daily Time Draft**:
  - Generiert Draft Time Entries aus Activity Log
  - AI generiert Narrative ("Recherche zu § 823 BGB in Akte Müller vs. Schmidt")
  - Anwalt reviewt/approved am Ende des Tages
  - Auto-fill: matter, activity_type, billable status
- **Matter-Scoped Timer** im MatterHeader:
  - Ein-Klick Timer der automatisch zur aktuellen Akte gehört
  - Wechselt Akte → Timer wechselt mit
  - Visible Running Indicator
- **Aufwand**: ~4-5 Tage (Activity Tracker + AI Narratives + Review UI)

### 26.3 Document Automation / Clause Library / Precedent Bank (ClauseBuddy, Bind, Edtek)

**Problem**: Dokumente werden von Grund auf neu geschrieben. Keine Wiederverwendung von Klauseln oder Präzedenzfällen.

**Industry Standard**:

- ClauseBuddy: "Automatic clause extraction from precedents, library of millions of sample clauses, AI-powered document analysis to spot drafting errors"
- Bind: "Fixed elements in templates and clause libraries. Variable elements captured through forms or AI interpretation and inserted automatically"
- Edtek: "Scope retrieval to matter type, jurisdiction, or practice area. Exclude specific matters with aggressive terms. Validation — a draft that is 90% right but contains one clause that's wrong is dangerous"

**Lösung**: `src/lib/clause-library.ts` + `src/lib/document-automation.ts`

- **Clause Library**:
  - Klauseln aus allen Akten-Dokumenten werden auto-extrahiert
  - Tagged nach: Practice Area, Clause Type (Haftung, Kündigung, Geheimhaltung, etc.)
  - Searchable: "Finde alle Haftungsklauseln aus Familienrecht-Akten"
  - AI generiert neue Klauseln basierend auf bestehenden
- **Precedent Bank**:
  - Erfolgreiche Schriftsätze werden als Precedent markiert
  - Tagged nach: Practice Area, Court, Outcome (won/lost/settled)
  - Quick-Insert in Drafting Tab
- **Document Automation**:
  - Template + Matter Data → fertiges Dokument
  - Merge Fields: client_name, case_number, court, opponent, dates
  - Conditional Clauses: "if family_law and has_children → insert Sorgerecht clause"
  - Validation: AI prüft fertigen Draft auf Konsistenz, fehlende Klauseln, Widersprüche
- **Aufwand**: ~4-5 Tage (Clause Extraction + Library + Template Merge + Validation)

---

## 27. AKTUALISIERTE SUB-PAGES (v3.2)

| Sub-Page  | Neu in v3.2                                             |
| --------- | ------------------------------------------------------- |
| Overview  | Matter-Scoped Timer (im Header)                         |
| Documents | Document Automation Panel (Template Merge)              |
| Drafting  | Clause Library Sidebar, Precedent Bank, AI Validation   |
| Billing   | Passive Time Drafts (Review & Approve)                  |
| Intake    | Automated Pipeline (Conflict → Letter → Team → Folders) |

---

## 28. ZUSÄTZLICHE NEUE DATEIEN (v3.2)

| Datei                                                | Zweck                            | Zeilen (est.) |
| ---------------------------------------------------- | -------------------------------- | ------------- |
| `src/lib/matter-intake-pipeline.ts`                  | Automated Intake → Case Pipeline | ~300          |
| `src/lib/passive-time-capture.ts`                    | Background Activity Tracker      | ~250          |
| `src/lib/clause-library.ts`                          | Clause Extraction + Library      | ~300          |
| `src/lib/document-automation.ts`                     | Template Merge + Validation      | ~250          |
| `src/components/legal/matter-timer.tsx`              | Matter-Scoped Timer im Header    | ~120          |
| `src/components/legal/clause-library-panel.tsx`      | Clause Search + Insert           | ~200          |
| `src/components/legal/precedent-bank.tsx`            | Precedent Browser                | ~150          |
| `src/components/legal/document-automation-panel.tsx` | Template Merge UI                | ~200          |
| `src/components/legal/passive-time-review.tsx`       | Daily Time Draft Review          | ~180          |
| `src/app/api/matter-intake-pipeline/route.ts`        | Pipeline API                     | ~120          |
| `src/app/api/clause-library/route.ts`                | Clause Library API               | ~100          |
| `src/app/api/passive-time/route.ts`                  | Passive Time API                 | ~100          |

---

## 29. FINALE PHASEN-ÜBERSICHT (v3.2 — KOMPLETT)

| Phase                        | Inhalt                                         | Priorität | Tage |
| ---------------------------- | ---------------------------------------------- | --------- | ---- |
| **CORE ARCHITECTURE**        |                                                |           |      |
| 1                            | Matter Sub-Routes + Layout                     | P0        | 3-5  |
| 2                            | Matter Switcher in Topbar                      | P0        | 1    |
| 3                            | Adaptive Sidebar                               | P0        | 1-2  |
| 4                            | Vitals Bar + Phase-Progress                    | P0        | 1.5  |
| 5                            | Matter-Scoped Quick Create                     | P1        | 1    |
| 6                            | Copilot + Matter Memory                        | P1        | 2-3  |
| **MATTER INTELLIGENCE v3.0** |                                                |           |      |
| 7                            | Matter Templates + Phase Triggers              | P1        | 3-4  |
| 8                            | Folder Structure + Evidence Grid               | P2        | 3-4  |
| 9                            | AI Chronology Builder                          | P2        | 3-4  |
| 10                           | Matter Stream                                  | P2        | 1-2  |
| 11                           | Cross-Matter Deep-Links                        | P2        | 1    |
| 12                           | Ethical Wall "Fail Closed" + Audit             | P2        | 1    |
| 13                           | Edge Cases & Polish                            | P2        | 1-2  |
| **MATTER INTELLIGENCE v3.1** |                                                |           |      |
| 14                           | In-Matter Search                               | P1        | 2    |
| 15                           | Proactive AI Recommendations                   | P1        | 3-4  |
| 16                           | Matter Team / Role Assignment                  | P1        | 2    |
| 17                           | Smart Notifications + Escalation               | P1        | 2-3  |
| 18                           | Similar Matters / Cross-Matter Intelligence    | P2        | 3-4  |
| 19                           | Matter Knowledge Graph                         | P2        | 3-4  |
| 20                           | Document Versioning / Redline                  | P2        | 3-4  |
| 21                           | Offline Read-Write + Conflict Resolution       | P2        | 3-4  |
| **MATTER INTELLIGENCE v3.2** |                                                |           |      |
| 22                           | **Automated Matter Intake Pipeline** (NEU)     | P1        | 3-4  |
| 23                           | **Passive Time Tracking / AutoTime** (NEU)     | P1        | 4-5  |
| 24                           | **Document Automation / Clause Library** (NEU) | P2        | 4-5  |

**Gesamt v3.2**: ~48-66 Tage

---

## 30. VORHANDENE INFRASTRUKTUR — KOMPLETT (v3.2)

| Feature                 | Vorhanden in                                                                                    | Was fehlt                                |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Hybrid Search Engine    | `server/src/core/search/hybrid.ts`                                                              | UI für in-matter search                  |
| case_slug Search Filter | `SearchResult.case_slug`, `permission-retrieval.test.ts`                                        | API-Endpoint + UI                        |
| Client Portal           | `portal-token.ts`, `portal/case/route.ts`, `portal/upload/route.ts`, `portal/messages/route.ts` | Integration in Matter Workspace          |
| Document Requests       | `api/document-requests` mit case_slug                                                           | UI in Matter Documents Tab               |
| Shared Spaces           | `api/shared-spaces`                                                                             | Integration in Matter                    |
| Offline Mutation Queue  | `useMutationQueue`                                                                              | Conflict Resolution UI                   |
| Legal Graph Schema      | `legal-graph/schema.ts`, `citations.ts`, `search.ts`                                            | Per-Matter Entity Graph                  |
| Entity Graph (basic)    | In Activity Tab vorhanden                                                                       | Interactive Knowledge Graph              |
| Notifications           | Topbar notifications                                                                            | Smart escalation, priority filtering     |
| Audit Log               | `caseData.auditLog`                                                                             | Pro-Sub-Route logging                    |
| Ethical Walls           | `ethical-wall.ts`                                                                               | "Fail Closed" in Layout                  |
| Quota System            | `quota.ts`                                                                                      | Pro-Matter tracking                      |
| Intake System           | `intake.ts`, `intake-conversion.ts`, `/api/intake/convert`                                      | Automated Pipeline                       |
| Conflict Check API      | `/api/legal/conflict-check`                                                                     | Auto-trigger in Pipeline                 |
| Time Tracking CRUD      | `time-tracking.ts`, `/api/time`                                                                 | Passive capture, AI narratives           |
| Mobile Timer            | `/mobile/time` mit Start/Stop                                                                   | Matter-scoped timer, background tracking |
| Billing Summary         | `computeBillingSummary()`, `markEntriesBilled()`                                                | Passive time drafts                      |
| Litigation Flow         | `litigation-flow.ts` mit Phases/Steps                                                           | Integration in Matter Phases             |
| Review Sets             | `review-sets.ts`                                                                                | Integration in Matter Documents          |
| Trust Accounting        | `trust-accounting.ts`                                                                           | Integration in Matter Billing            |
| Litigation Analytics    | `litigation-analytics.ts`                                                                       | Integration in Matter Overview           |
| RVG Cost Calculation    | `src/lib/rvg.ts`                                                                                | Matter-scoped cost display               |
| Deadline Rules          | `src/lib/deadline-rules.ts`                                                                     | Template-based auto-generation           |
| AI Evidence Cards       | `aiEvidenceCards` in CaseDetail                                                                 | Grid View, Bulk Extraction               |
| Timeline Events         | `timelineEvents` in caseData                                                                    | AI Chronology Builder                    |
| Citation Extraction     | `parseCitations`, `legal-graph/citations.ts`                                                    | Per-matter knowledge graph               |
| Co-Editing Presence     | `realtime.ts`, `use-presence.ts`, `presence-indicator.tsx`                                      | Matter-scoped presence                   |
| Voice-to-Prompt         | `use-voice-input.ts`, `voice-to-prompt-button.tsx`                                              | Matter-scoped voice                      |
| DMS Connectors          | `dms/box.ts`, `dms/index.ts`                                                                    | Matter-scoped DMS access                 |
| Workflow Engine         | `workflow.ts`                                                                                   | Matter template triggers                 |

---

## 31. DEFINITION OF DONE (v3.2 — ENDGÜLTIG)

### Core Architecture

- [ ] 9 Matter Sub-Routes funktional
- [ ] MatterDataProvider teilt State
- [ ] Tab-Bar URL-basiert (Primär/Sekundär Gruppen per Miller's Law)
- [ ] Sidebar Matter Mode + Briefcase
- [ ] Pinned Matters in Sidebar
- [ ] Matter Switcher in Topbar
- [ ] Quick Create mit `presetCaseSlug`
- [ ] Copilot matter-scoped
- [ ] Matter Stream
- [ ] Cross-Matter Deep-Links

### Matter Intelligence (v3.0)

- [ ] Vitals Bar im MatterHeader
- [ ] Phase-Progress-Indicator
- [ ] Matter Templates pro Practice Area (min. 3)
- [ ] Phase-Change triggert Tasks/Docs
- [ ] Folder-Tree (3-Level) im Documents Tab
- [ ] Evidence Grid (Document Matrix)
- [ ] AI Chronology Builder
- [ ] Matter Memory in System-Prompt
- [ ] Ethical Wall "Fail Closed"
- [ ] Pro-Matter AI Usage Tracking

### Matter Intelligence (v3.1)

- [ ] In-Matter Search Bar
- [ ] Proactive AI Recommendations
- [ ] Matter Team mit Rollen
- [ ] Smart Notifications mit Tiered Escalation
- [ ] Similar Matters Panel
- [ ] Interactive Matter Knowledge Graph
- [ ] Document Versioning / Redline
- [ ] Offline Read-Write mit Conflict Resolution

### Matter Intelligence (v3.2 NEU)

- [ ] Automated Matter Intake Pipeline (Conflict → Letter → Team → Folders)
- [ ] Passive Time Tracking / AutoTime (Background capture + AI narratives)
- [ ] Document Automation / Clause Library / Precedent Bank

### Quality

- [ ] TypeScript: 0 Errors
- [ ] Tests: Alle bestehenden + neue
- [ ] Build: erfolgreich
- [ ] Mobile: Tab-Bar scrollbar, Switcher als Bottom-Sheet
- [ ] Archived Cases: Sub-Pages Read-Only
- [ ] Client Portal in Matter Workspace integriert

---

## 32. ZUSAMMENFASSUNG: BLUEPRINT v3.2 IST KOMPLETT

### Was der Blueprint abdeckt (32 Sektionen):

1. **Core Architecture**: 9 Sub-Routes, MatterDataProvider, Adaptive Sidebar, Matter Switcher
2. **Matter Header**: Vitals Bar, Phase-Progress, Matter Timer, Team Panel
3. **Matter Templates**: Pro Practice Area — Tasks, Deadlines, Folders, Vitals, Phases
4. **AI Features**: Matter Memory, Proactive Recommendations, Chronology Builder, Evidence Grid
5. **Search**: In-Matter Search (Hybrid Engine), Cross-Matter Intelligence, Similar Matters
6. **Knowledge Graph**: Interactive Entity Map mit Source-Links
7. **Documents**: 3-Level Folder Tree, Versioning, Redline, Clause Library, Precedent Bank, Document Automation
8. **Billing**: Passive Time Tracking, AutoTime, Pro-Matter Cost Tracking, RVG, Trust Accounting
9. **Intake**: Automated Pipeline (Conflict → Letter → Team → Folders → Welcome)
10. **Notifications**: Smart Escalation, Priority Levels, Matter-Scoped
11. **Offline**: Read-Write mit Conflict Resolution
12. **Security**: Ethical Wall "Fail Closed", Audit Logging, Pro-Sub-Route
13. **UX**: Laws of UX angewendet (Hick, Miller, Jakob, Zeigarnik, Goal-Gradient, Doherty)
14. **Mobile**: Tab-Bar, Bottom-Sheet Switcher, Mobile Timer

### Kennzahlen:

- **Neue Dateien**: ~54
- **Geänderte Dateien**: ~24
- **Gesamtaufwand**: ~48-66 Tage
- **Phasen**: 24 (P0: 4, P1: 9, P2: 11)
- **Vorhandene Infrastruktur**: 30 Features die nur integriert werden müssen
- **Forschungsquellen**: 20+ Plattformen (Clio, Filevine, Smokeball, Harvey, Vaquill, CreateOS, Syllo, Juristic, CaseQube, DeepJudge, Casero, iManage, NetDocuments, LawVu, Align, Daylite, Actionstep, Rize, Traced, Caddi, MatterReady, LegalAI Space, JudicialMind)
