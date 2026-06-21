# Deep Audit: Chatbot · Brain-Chat · Dashboard-Integration

**Datum:** 2026-06-21  
**Auditor:** Cascade (Principal Engineer Mode)  
**Scope:** Chat-Interfaces, Brain-Kommunikation, Model-Auswahl, Token-Tracking, Dashboard-Integration, Accessibility  
**Status:** KRITISCH — mehrere strukturelle Defizite gefunden

---

## Executive Summary

Das System hat **zwei parallele Chat-Interfaces** (`/dashboard/query` und `/dashboard/assistant`) mit **überlappenden, aber inkonsistenten Feature-Sets**. Keines von beiden bietet die volle Funktionalität, die ein State-of-the-Art Legal-AI Chatbot (wie Harvey) bietet. Die Brain-Integration ist technisch vorhanden aber im Chat nicht sichtbar. Token-Tracking existiert im Typsystem wird aber **nicht in der UI angezeigt**.

**Reifegrad:** 45% — Fundament da, aber fragmentiert und nicht production-ready für Agency-Level.

---

## 1. Ist-Zustand: Was existiert

### 1.1 Chat-Interfaces

| Feature                               | `/dashboard/query`   | `/dashboard/assistant`     |
| ------------------------------------- | -------------------- | -------------------------- |
| SSE Streaming                         | ✅                   | ✅ (via `api.query.think`) |
| Model Selector                        | ✅ (`ModelSelector`) | ❌                         |
| Mode (conservative/balanced/tokenmax) | ✅                   | ✅ (mapped)                |
| Superbrain Mode (QueryMode)           | ✅                   | ✅                         |
| Case/Akte Selection                   | ❌                   | ✅                         |
| Jurisdiction (DE/AT/CH/EU)            | ❌                   | ✅                         |
| File Upload                           | ❌                   | ✅                         |
| Markdown Rendering                    | ❌ (raw text)        | ✅ (`renderMarkdown`)      |
| Chat History Persistence              | ❌ (lost on refresh) | ✅ (IndexedDB)             |
| Matter Context Understanding          | ❌                   | ✅                         |
| Citations Pills                       | ✅                   | ✅                         |
| Gaps with Categorization              | ✅ (7 categories)    | ❌                         |
| AI Badge / Grounding Status           | ✅                   | ❌                         |
| Copy Button                           | ✅ (hover)           | ✅                         |
| Clear Chat                            | ✅                   | ✅ (with confirm)          |
| Example Queries                       | ✅ (industry-tuned)  | ✅ (static 4)              |

### 1.2 Model Management

- **Katalog:** 10 Modelle in `AI_MODELS` (`@/lib/model-config.ts`) — Claude (3), GPT (3), Gemini (2), Mistral (1), ZeroEntropy (1)
- **Settings Page:** `/dashboard/settings/ai-model` — vollständige Model-Card-Auswahl mit Persistenz
- **Per-Query Override:** `ModelSelector` in Query-Page (nicht persistent)
- **EU Policy:** `isModelAllowedForPolicy` filtert EU-only Modelle
- **API:** `GET/PATCH /api/settings/model`

### 1.3 Token & Usage Tracking

- **Typsystem:** `QueryResponse.tokens_used?: number` und `latency_ms?: number` — **definiert aber nie in UI gerendert**
- **Per-Model Tracking:** `recordModelUsage()` in `@/lib/plans.ts` — schreibt `input_tokens`, `output_tokens` pro Model
- **Billing Page:** `ModelBreakdownCard` zeigt monatliche Token-Verbräuche mit geschätzten Kosten
- **Usage API:** `GET /api/usage` → `{ queries, limits, modelBreakdown }`

### 1.4 Brain Integration

- **Brain Page:** `/dashboard/brain` — Browser mit Typfiltern, Search, Quality Panel
- **Graph Page:** `/dashboard/graph`
- **API Layer:** `api.brain.*` (stats, search, pages, graph, recentQueries)
- **Think API:** `POST /api/think` — SSE Proxy zur Engine mit Citation Gate

### 1.5 Dashboard

- **Sidebar:** 7 Sektionen, 50+ Nav-Items, Akkordeon mit Search
- **Home:** Widget-Dashboard mit MetricRail, Queues, QuickActions
- **Command Palette:** Cmd+K
- **Topbar:** Theme Toggle, Mobile Menu, Guide

---

## 2. Kritische Defizite (KRITISCH)

### 2.1 Zwei parallele Chats → Fragmentierte UX

**Problem:** `/dashboard/query` und `/dashboard/assistant` sind zwei separate Seiten mit **inkompatiblen Feature-Sets**. Ein Nutzer muss zwischen beiden wechseln, um:

- Case Context + Model Selection zu kombinieren
- Markdown Rendering + Token Display zu bekommen
- File Upload + Gaps Kategorisierung zu nutzen

**Impact:** Verwirrende UX, doppelte Code-Pflege, inkonsistentes Verhalten.

**Lösung:** **Ein** unified Chat-Panel als wiederverwendbare Komponente, konfigurierbar für verschiedene Kontexte (Case-spezifisch, Global, Brain-Page-Embedded).

### 2.2 Token-Anzeige fehlt im Chat

**Problem:** `QueryResponse.tokens_used` und `latency_ms` sind im Typsystem definiert (`@/lib/types.ts:45-46`), werden aber:

- Vom `/api/think` Route Handler **nicht aus dem SSE Stream extrahiert**
- In keiner Chat-UI angezeigt

**Was Harvey hat:** Pro-Response Token-Counter, Latency, kumulativer Session-Verbrauch, verbleibendes Kontingent.

**Lösung:**

1. Engine SSE Stream muss `tokens_used` und `latency_ms` im finalen Event senden
2. `/api/think` muss diese Felder durchreichen
3. Chat-UI muss sie pro-Message und kumulativ anzeigen

### 2.3 Kein Live-Token-Counter / Kontingent-Anzeige

**Problem:** Im Chat gibt es keine Anzeige von:

- Verbleibende Queries dieses Monats
- Token-Verbrauch der aktuellen Session
- Geschätzte Kosten pro Query

**Lösung:** Token-Widget im Chat-Header mit Live-Update nach jeder Response.

### 2.4 Query-Page: Keine Chat-History-Persistenz

**Problem:** `/dashboard/query` speichert Messages nur in `useState`. Ein Page-Refresh löscht den gesamten Verlauf. Die Assistant-Page nutzt IndexedDB (`loadChatHistory`, `saveChatHistory`).

**Lösung:** Unified Chat-History in IndexedDB mit Session-IDs.

### 2.5 Kein "Stop Generation" Button

**Problem:** Weder Query- noch Assistant-Page haben einen Abort-Button während Streaming. Ein Nutzer muss auf den vollen Response warten.

**Lösung:** `AbortController` im SSE-Fetch, Stop-Button ersetzt Send-Button während Loading.

### 2.6 Kein Brain-Status im Chat

**Problem:** Im Chat gibt es keinen Indikator für:

- Engine connectivity (online/offline/degraded)
- Brain freshness (stale/fresh)
- Index status (pages indexed, OCR pending)

**Lösung:** Brain-Status-Badge im Chat-Header mit Live-Polling.

---

## 3. Major Defizite (HIGH)

### 3.1 Kein einheitliches Chat-Component

**Problem:** Chat-Logik ist dupliziert:

- Message handling: `useState<Message[]>` in beiden Pages
- SSE parsing: `csrfFetch` direkt in Query, `api.query.think()` in Assistant
- Streaming display: Separate Implementations
- Auto-scroll: Zwei verschiedene Implementations

**Lösung:** `<ChatPanel>` Komponente mit Props für Feature-Toggling.

### 3.2 Keine Conversation Sessions/Threads

**Problem:** Alle Messages sind in einer flachen Liste. Keine Möglichkeit für:

- Mehrere parallele Konversationen
- Konversation pro Akte
- Konversations-History mit Titeln

**Lösung:** Session-Management mit Sidebar (ähnlich ChatGPT), persistiert in IndexedDB.

### 3.3 Keine Message-Actions

**Problem:** Keine Möglichkeit zu:

- Message editieren und neu senden
- Response regenerieren
- Message als Markdown exportieren
- Auf eine specific Message antworten (quote-reply)

### 3.4 Kein Chat auf Dashboard-Home

**Problem:** Die Dashboard-Startseite hat kein Chat-Widget. Nutzer müssen navigieren.

**Lösung:** Collapsible Chat-Drawer oder Floating-Widget auf allen Dashboard-Pages.

### 3.5 Kein Brain-Embedded Chat

**Problem:** Die Brain-Page (`/dashboard/brain`) und Brain-Detail-Pages haben keinen Chat-Kontext. Kein "Frage zu dieser Seite stellen" Button.

**Lösung:** Brain-Detail-Page mit Sidebar-Chat, der die Page-Slug als Kontext mitsendet.

### 3.6 Recent Queries nicht auf Dashboard

**Problem:** `useRecentQueries` existiert und wird geladen, aber auf der Dashboard-Home nicht angezeigt.

**Lösung:** "Letzte Anfragen" Widget auf Dashboard-Home.

### 3.7 Inconsistent API Paths

**Problem:**

- Query-Page: `csrfFetch("/api/think", ...)` direkt
- Assistant-Page: `api.query.think()` (welches auch `csrfFetch` nutzt)
- Beide parsen SSE unterschiedlich

**Lösung:** Einheitlicher `api.query.think()` Aufruf in beiden (oder im unified Component).

---

## 4. Moderate Defizite (MEDIUM)

### 4.1 Kein Markdown in Query-Page

**Problem:** Query-Page zeigt `whitespace-pre-wrap` raw text. Assistant-Page nutzt `renderMarkdown`. Inkonsistent.

### 4.2 Kein Model-Selector in Assistant-Page

**Problem:** Assistant-Page hat keine Model-Auswahl. Nutzer können kein Model pro-Query wählen wenn sie mit einer Akte chatten.

### 4.3 Keine Cost-Estimate pro Query

**Problem:** Vor dem Senden gibt es keine Schätzung: "Diese Query wird ca. X Tokens kosten (~Y €)".

### 4.4 Kein Model-Recommendation

**Problem:** Keine Empfehlung: "Für diese komplexe Query empfehlen wir Claude Opus" basierend auf Query-Länge/Komplexität.

### 4.5 Mobile Responsiveness

**Problem:**

- Query-Page Header: 3 Selectors + Trash in einer Reihe — overflow auf Mobile
- Assistant-Page Header: 3 `<select>` + Trash — noch enger
- Keine responsive Breakpoints für Header-Controls

### 4.6 Keine Keyboard Shortcuts

**Problem:**

- Kein `Escape` zum Schließen von Menüs
- Kein `Cmd+Enter` als Alternative zum Senden
- Kein `/` Focus in Chat-Input (wie Slack)

### 4.7 Keine ARIA Live Regions für Streaming

**Problem:** Screen-Reader bekommen keine Announcement dass eine Response streamt oder fertig ist.

### 4.8 Kein Loading Skeleton

**Problem:** Beide Pages zeigen "Denke nach..." mit Typing-Dots, aber kein Skeleton für die erste Response.

### 4.9 Keine Empty-State-Konsistenz

**Problem:** Query-Page: Industry-tuned Example Queries (5). Assistant-Page: Static 4 Suggestions. Inkonsistent.

### 4.10 Kein Chat-Export

**Problem:** Keine Möglichkeit eine Konversation als Markdown/PDF zu exportieren.

---

## 5. Low Defizite (LOW)

### 5.1 Kein Dark-Mode-Test für Chat

Chat-Bubbles nutzen `brand-soft` und `brand-bg` — muss in Dark-Mode verifiziert werden.

### 5.2 Kein Copy-Button für Citations

Citation-Pills haben keinen Copy-Button für den Slug.

### 5.3 Kein "Open in Brain" für Citations in Assistant

Assistant-Page hat Citation-Links, aber sie öffnen in neuem Tab statt Inline-Navigation.

### 5.4 Keine Typing-Indikator-Variation

Beide Pages zeigen statische 3 Dots. Keine Progress-Indikation (z.B. "Searching brain... → Synthesizing... → Grounding...").

---

## 6. Architektur-Empfehlung: Unified Chat Architecture

### 6.1 Ziel-Architektur

```
src/components/chat/
├── ChatPanel.tsx              # Core chat component (configurable)
├── ChatMessage.tsx            # Single message renderer (user/assistant)
├── ChatInput.tsx              # Input area with attachments, model selector
├── ChatHeader.tsx             # Header with context, model, mode, brain status
├── ChatHistory.tsx            # IndexedDB persistence layer
├── ChatSessions.tsx           # Session/thread management
├── ChatTokenWidget.tsx        # Live token counter + cost estimate
├── ChatBrainStatus.tsx        # Brain health indicator
├── ChatCitations.tsx          # Citation pills + gaps (unified)
├── ChatEmptyState.tsx         # Configurable empty state with examples
├── ChatStreamingIndicator.tsx # Multi-phase typing indicator
└── chat-context.tsx           # React context for chat state
```

### 6.2 ChatPanel Props (Feature-Toggling)

```typescript
interface ChatPanelProps {
  context?: {
    type: "global" | "case" | "brain_page";
    caseSlug?: string;
    pageSlug?: string;
  };
  features?: {
    modelSelector?: boolean; // default: true
    modeSelector?: boolean; // default: true
    caseSelector?: boolean; // default: true (when not case-scoped)
    jurisdictionSelector?: boolean; // default: true
    fileUpload?: boolean; // default: true
    markdownRendering?: boolean; // default: true
    sessionHistory?: boolean; // default: true
    tokenWidget?: boolean; // default: true
    brainStatus?: boolean; // default: true
    exampleQueries?: boolean; // default: true
    exportChat?: boolean; // default: true
  };
  persistHistory?: boolean; // default: true
  className?: string;
}
```

### 6.3 Deployment Points

1. **`/dashboard/chat`** — Neue unified Page (ersetzt `/query` und `/assistant`)
2. **Dashboard-Home** — Collapsible Chat-Drawer (Floating Button unten rechts)
3. **Brain-Detail-Page** — Sidebar-Chat mit Page-Kontext
4. **Case-Detail-Page** — Sidebar-Chat mit Case-Kontext
5. **Mobile** — Full-screen Chat via Bottom-Nav

---

## 7. TODO-Plan: Agency-Level Roadmap

### Phase 1: Foundation (P1-CHAT-001 bis P1-CHAT-010) — 1-2 Tage

| #           | Ticket                               | Priorität | Aufwand | Beschreibung                                                |
| ----------- | ------------------------------------ | --------- | ------- | ----------------------------------------------------------- |
| P1-CHAT-001 | Unified ChatPanel Component          | KRITISCH  | 4h      | Extrahiere gemeinsame Chat-Logik in `<ChatPanel>`           |
| P1-CHAT-002 | Unified ChatMessage Component        | KRITISCH  | 2h      | Einheitliche Message-Renderer mit Markdown + Actions        |
| P1-CHAT-003 | Unified ChatInput Component          | KRITISCH  | 2h      | Input mit Model-Selector, Attachments, Keyboard             |
| P1-CHAT-004 | Unified ChatHeader Component         | KRITISCH  | 2h      | Header mit Context, Model, Mode, Brain-Status               |
| P1-CHAT-005 | Chat History Persistence (IndexedDB) | KRITISCH  | 2h      | Session-basierte Persistenz für alle Chat-Varianten         |
| P1-CHAT-006 | Stop Generation Button               | KRITISCH  | 1h      | AbortController + UI Toggle                                 |
| P1-CHAT-007 | Token Display pro Response           | KRITISCH  | 2h      | `tokens_used` + `latency_ms` aus SSE extrahieren + anzeigen |
| P1-CHAT-008 | Unified Citations + Gaps Component   | HIGH      | 2h      | Zusammenführung der Citation/Gap-Logik                      |
| P1-CHAT-009 | Unified Empty State                  | HIGH      | 1h      | Konfigurierbare Example-Queries                             |
| P1-CHAT-010 | Redirect旧 Pages → /dashboard/chat   | HIGH      | 0.5h    | `/query` und `/assistant` redirecten zur neuen Page         |

### Phase 2: Token & Model (P2-CHAT-011 bis P2-CHAT-018) — 1-2 Tage

| #           | Ticket                                            | Priorität | Aufwand | Beschreibung                                               |
| ----------- | ------------------------------------------------- | --------- | ------- | ---------------------------------------------------------- |
| P2-CHAT-011 | Live Token Widget im Chat-Header                  | KRITISCH  | 2h      | Kumulative Session-Tokens + verbleibende Quota             |
| P2-CHAT-012 | Cost Estimate pro Query                           | HIGH      | 1.5h    | Pre-Send Schätzung basierend auf Model + Query-Länge       |
| P2-CHAT-013 | Model Recommendation Engine                       | HIGH      | 2h      | Auto-Empfehlung basierend auf Query-Komplexität            |
| P2-CHAT-014 | Brain Status Badge im Chat                        | HIGH      | 1.5h    | Engine-Connectivity + Freshness + Index-Status             |
| P2-CHAT-015 | SSE Stream: tokens_used + latency_ms durchreichen | KRITISCH  | 1h      | `/api/think` muss finale Metadaten extrahieren + forwarden |
| P2-CHAT-016 | Per-Session Token Budget                          | MEDIUM    | 2h      | Optional: Token-Limit pro Session mit Warnung              |
| P2-CHAT-017 | Model Comparison View                             | MEDIUM    | 3h      | Side-by-side gleiche Query mit 2 Modellen                  |
| P2-CHAT-018 | Model Info Tooltip                                | LOW       | 0.5h    | Hover-Info mit Context-Window, Cost, Speed                 |

### Phase 3: Sessions & History (P3-CHAT-019 bis P3-CHAT-025) — 1-2 Tage

| #           | Ticket                          | Priorität | Aufwand | Beschreibung                                          |
| ----------- | ------------------------------- | --------- | ------- | ----------------------------------------------------- |
| P3-CHAT-019 | Chat Session Management         | HIGH      | 3h      | Mehrere Sessions mit Titeln, persistiert in IndexedDB |
| P3-CHAT-020 | Session Sidebar (ChatGPT-style) | HIGH      | 2h      | Liste vergangener Konversationen, durchsuchbar        |
| P3-CHAT-021 | Auto-Session-Titel              | MEDIUM    | 1h      | KI-generierter Titel aus erster User-Message          |
| P3-CHAT-022 | Session Search                  | MEDIUM    | 1.5h    | Volltext-Suche über alle Sessions                     |
| P3-CHAT-023 | Chat Export (Markdown/PDF)      | MEDIUM    | 2h      | Konversation als Markdown oder PDF herunterladen      |
| P3-CHAT-024 | Message Edit + Resend           | MEDIUM    | 1.5h    | Edit-Button auf User-Messages, neu senden             |
| P3-CHAT-025 | Response Regenerate             | MEDIUM    | 1h      | Regenerate-Button auf Assistant-Messages              |

### Phase 4: Dashboard Integration (P4-CHAT-026 bis P4-CHAT-032) — 1-2 Tage

| #           | Ticket                           | Priorität | Aufwand | Beschreibung                                              |
| ----------- | -------------------------------- | --------- | ------- | --------------------------------------------------------- |
| P4-CHAT-026 | Chat Drawer auf Dashboard-Home   | HIGH      | 2h      | Floating Chat-Button + Collapsible Drawer                 |
| P4-CHAT-027 | Brain-Detail-Page: Embedded Chat | HIGH      | 2h      | Sidebar-Chat mit Page-Kontext auf Brain-Detail            |
| P4-CHAT-028 | Case-Detail-Page: Embedded Chat  | HIGH      | 2h      | Sidebar-Chat mit Case-Kontext auf Case-Detail             |
| P4-CHAT-029 | Recent Queries Widget auf Home   | MEDIUM    | 1h      | Letzte 5 Anfragen mit Link zur Session                    |
| P4-CHAT-030 | Chat Deep-Link from Widgets      | MEDIUM    | 0.5h    | Quick-Action "AI Query" linkt zu `/dashboard/chat?q=...`  |
| P4-CHAT-031 | Sidebar: "Chat" als Primary Item | HIGH      | 0.5h    | Chat als Top-Level Nav-Item (nicht versteckt in Research) |
| P4-CHAT-032 | Command Palette: Chat Actions    | LOW       | 1h      | "Neue Chat-Session", "Chat durchsuchen" in Cmd+K          |

### Phase 5: UX Polish & Accessibility (P5-CHAT-033 bis P5-CHAT-040) — 1 Tag

| #           | Ticket                          | Priorität | Aufwand | Beschreibung                                  |
| ----------- | ------------------------------- | --------- | ------- | --------------------------------------------- |
| P5-CHAT-033 | Multi-Phase Streaming Indicator | MEDIUM    | 1h      | "Searching → Synthesizing → Grounding → Done" |
| P5-CHAT-034 | Keyboard Shortcuts              | MEDIUM    | 1h      | Escape, Cmd+Enter, /, Shift+Enter             |
| P5-CHAT-035 | ARIA Live Regions               | HIGH      | 1h      | Screen-Reader Announcements für Streaming     |
| P5-CHAT-036 | Mobile Responsive Header        | HIGH      | 1h      | Collapsible Controls, Bottom-Sheet auf Mobile |
| P5-CHAT-037 | Loading Skeleton                | LOW       | 0.5h    | Skeleton für erste Response                   |
| P5-CHAT-038 | Dark Mode Verification          | MEDIUM    | 1h      | Chat-Bubbles, Citations, Gaps in Dark Mode    |
| P5-CHAT-039 | Copy Button für Citations       | LOW       | 0.5h    | Slug kopierbar                                |
| P5-CHAT-040 | Focus Management                | MEDIUM    | 1h      | Focus-Trap in Drawer, Focus nach Send         |

### Phase 6: Advanced Features (P6-CHAT-041 bis P6-CHAT-046) — Optional, 2-3 Tage

| #           | Ticket                        | Priorität | Aufwand | Beschreibung                                            |
| ----------- | ----------------------------- | --------- | ------- | ------------------------------------------------------- |
| P6-CHAT-041 | Quote-Reply auf Messages      | LOW       | 1.5h    | Auf specific Message antworten mit Quote                |
| P6-CHAT-042 | Chat Templates/Snippets       | LOW       | 2h      | Wiederverwendbare Query-Templates für Kanzlei           |
| P6-CHAT-043 | Chat Sharing (Read-Only Link) | LOW       | 2h      | Konversation als lesbarer Link teilen                   |
| P6-CHAT-044 | Chat Pinning                  | LOW       | 1h      | Wichtige Sessions anpinnen                              |
| P6-CHAT-045 | Chat Labels/Tags              | LOW       | 1.5h    | Sessions taggen (z.B. "Mandat Müller", "Recherche")     |
| P6-CHAT-046 | Chat Analytics Dashboard      | LOW       | 2h      | Usage-Stats: Queries/Tag, Model-Verteilung, Avg Latency |

---

## 8. Priorisierung & Timeline

### Sprint 1 (Woche 1): Foundation + Token Display

- P1-CHAT-001 bis P1-CHAT-010 (Foundation)
- P2-CHAT-011, P2-CHAT-015 (Token Display + SSE)
- **Ergebnis:** Ein unified Chat mit Token-Anzeige, Stop-Button, Persistenz

### Sprint 2 (Woche 2): Sessions + Dashboard Integration

- P3-CHAT-019 bis P3-CHAT-025 (Sessions)
- P4-CHAT-026 bis P4-CHAT-032 (Dashboard Integration)
- **Ergebnis:** Chat-Sessions, Chat-Drawer, Embedded Chats auf Detail-Pages

### Sprint 3 (Woche 3): Polish + Advanced

- P5-CHAT-033 bis P5-CHAT-040 (UX/Accessibility)
- P2-CHAT-012 bis P2-CHAT-014 (Cost Estimate, Model Rec, Brain Status)
- **Ergebnis:** Production-ready, barrierefrei, mobil

### Sprint 4 (optional): Advanced Features

- P6-CHAT-041 bis P6-CHAT-046
- **Ergebnis:** Agency-Level Feature-Parität mit Harvey

---

## 9. Definition of Done (pro Ticket)

- [ ] Code implementiert, keine Mocks, keine Platzhalter
- [ ] TypeScript strict, keine `any` (außer dokumentierte Ausnahmen)
- [ ] Keyboard-navigierbar (Tab, Enter, Escape)
- [ ] ARIA-Labels vorhanden
- [ ] Dark-Mode getestet
- [ ] Mobile responsive (< 768px)
- [ ] Error-State vorhanden (Engine offline, API-Fehler)
- [ ] Loading-State vorhanden (Skeleton oder Spinner)
- [ ] Empty-State vorhanden (keine Messages, keine Sessions)
- [ ] Unit-Test oder E2E-Test für Core-Flow

---

## 10. Referenzen

### Key Files (aktuell)

- `@/src/app/dashboard/query/page.tsx` — Query Chat (653 Zeilen)
- `@/src/app/dashboard/assistant/page.tsx` — Assistant Chat (567 Zeilen)
- `@/src/components/dashboard/model-selector.tsx` — Model Dropdown
- `@/src/app/dashboard/settings/ai-model/page.tsx` — Model Settings
- `@/src/app/dashboard/billing/page.tsx` — Usage + Model Breakdown
- `@/src/lib/model-config.ts` — AI Model Katalog (10 Modelle)
- `@/src/lib/api.ts` — API Client (think, brain, upload)
- `@/src/app/api/think/route.ts` — SSE Proxy zur Engine
- `@/src/app/api/usage/route.ts` — Usage API
- `@/src/lib/plans.ts` — Quota + Model Usage Tracking
- `@/src/lib/matter-context-types.ts` — QueryMode + Matter Context Types
- `@/src/components/dashboard/sidebar.tsx` — Sidebar Navigation
- `@/src/components/dashboard/widget-dashboard.tsx` — Dashboard Home Widgets
- `@/src/lib/types.ts` — QueryResponse mit `tokens_used`, `latency_ms`

### Harvey-Feature-Parity Check

| Harvey Feature             | Subsumio Status       | Ticket              |
| -------------------------- | --------------------- | ------------------- |
| Case-scoped Chat           | ✅ (Assistant)        | P1-CHAT-001 (unify) |
| Model Selection            | ✅ (Query only)       | P1-CHAT-003 (unify) |
| Token Counter pro Response | ❌                    | P2-CHAT-007         |
| Live Token/Quota Widget    | ❌                    | P2-CHAT-011         |
| Cost Estimate              | ❌                    | P2-CHAT-012         |
| Stop Generation            | ❌                    | P1-CHAT-006         |
| Chat History/Sessions      | Teil (Assistant only) | P3-CHAT-019         |
| Chat Export                | ❌                    | P3-CHAT-023         |
| Message Edit/Regenerate    | ❌                    | P3-CHAT-024/025     |
| Embedded Chat (Case/Doc)   | ❌                    | P4-CHAT-027/028     |
| Brain Status Indicator     | ❌                    | P2-CHAT-014         |
| Citations + Grounding      | ✅                    | —                   |
| Gap Detection              | ✅ (Query only)       | P1-CHAT-008 (unify) |
| File Upload in Chat        | ✅ (Assistant only)   | P1-CHAT-003 (unify) |
| Markdown Rendering         | ✅ (Assistant only)   | P1-CHAT-002 (unify) |

---

**Fazit:** Das Fundament ist solide (SSE Streaming, Model Katalog, Brain API, Matter Context), aber die Chat-Erfahrung ist fragmentiert über zwei Pages und fehlt kritische Features (Token Display, Sessions, Stop, Embedded Chat). Die Unified Chat Architecture ist der Schlüssel zum Agency-Level. Geschätzter Gesamtaufwand: **5-7 Tage** für Sprint 1-3 (Production-Ready), **+2-3 Tage** für Sprint 4 (Advanced).
