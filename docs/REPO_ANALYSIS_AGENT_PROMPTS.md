# Subsumio Repo-Analyse & Agent-Prompt-Strategie

> **Ziel**: Vollständige Codebasis-Analyse mit aufgeteilten Prompts für verschiedene Agenten.
> Jeder Prompt prüft Code-Qualität, Vollständigkeit, Use-Case-Abdeckung und Cross-Layer-Interaktion.
> Fokus: End-to-End Kanzlei OS, robust genug für Production-Launch.

---

## Architektur-Überblick

```
┌─────────────────────────────────────────────────────────────┐
│                    PUBLIC SITE (Marketing)                    │
│  src/app/ (landing, pricing, blog, SEO, cities)              │
├─────────────────────────────────────────────────────────────┤
│                    DASHBOARD (Next.js App Router)             │
│  src/app/dashboard/ (80+ Seiten, Layout, Sidebar, Topbar)    │
│  src/components/ (dashboard, legal, chat, marketing, ui)     │
├─────────────────────────────────────────────────────────────┤
│                    API LAYER (Next.js API Routes)             │
│  src/app/api/ (255+ Routes: legal, auth, upload, cron, etc.) │
│  src/lib/api.ts (Client-Side API Wrapper)                    │
├─────────────────────────────────────────────────────────────┤
│                    BUSINESS LOGIC (Lib Layer)                 │
│  src/lib/ (260+ Module: auth, billing, dms, legal, whatsapp) │
│  src/lib/legal-chat/ (WhatsApp Natural Language Engine)      │
├─────────────────────────────────────────────────────────────┤
│                    GBRAIN ENGINE (Server Core)                │
│  server/src/core/ (596 Module: engine, search, ai, minions)  │
│  server/src/core/legal/ (21 Module: analyze, draft, review)  │
│  server/src/core/minions/ (52 Module: queue, workers, handlers)│
│  server/src/commands/web-api.ts (6081 Zeilen — Express API)  │
├─────────────────────────────────────────────────────────────┤
│                    EXTERNAL INTEGRATIONS                      │
│  DMS (SharePoint, NetDocuments, Box), DocuSign, beA,         │
│  WhatsApp, Email, Stripe, WorkOS SSO, SCIM                   │
├─────────────────────────────────────────────────────────────┤
│                    DATA & INFRASTRUCTURE                      │
│  PostgreSQL + pgvector / PGLite (WASM)                       │
│  law-corpus/ (AT, CH, DE, EU Gesetzestexte)                  │
│  Capacitor (Mobile), Word/Outlook Add-ins                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Bereich 1: Document Upload & Processing Engine (HERZSTÜCK)

### Scope

- `src/app/api/upload/` — Upload API Routes (sync + async, presigned, token)
- `src/app/api/upload-status/` — Upload Status Polling
- `src/app/api/upload-token/` — Presigned Upload Token
- `src/app/api/ocr-status/` — OCR Status
- `src/app/api/files/` — File Serving
- `src/lib/upload-pipeline.ts` — Upload Pipeline Orchestrator
- `src/lib/upload-validation.ts` — Upload Validation (MIME, Size, Virus)
- `src/lib/upload-routing.ts` — Sync vs Async Routing
- `src/lib/upload-queue.ts` — Upload Queue
- `src/lib/upload-formats.ts` — Supported Formats
- `src/lib/presigned-upload.ts` — Presigned Upload (S3-compatible)
- `src/lib/virus-scan.ts` — Virus Scanning
- `src/lib/extraction-status.ts` — Extraction Status Tracking
- `src/lib/post-upload-outbox.ts` — Post-Upload Outbox (Notifications)
- `src/components/presigned-uploader.tsx` — Uploader UI Component
- `src/app/dashboard/upload/` — Upload Dashboard Page
- `src/app/dashboard/vault/` — Vault (Dokumenten-Verwaltung)
- `server/src/core/extract-document.ts` — Document Text Extraction (48KB)
- `server/src/core/minions/handlers/extract-document.ts` — Async Extract Handler
- `server/src/commands/web-api.ts` — `runExtractionAndImport`, `splitAndImportLargeDocument`
- `server/src/core/file-store.ts` — Durable File Storage
- `server/src/core/upload-security.ts` — Upload Security Layer

### Prompt

```
Du bist ein Principal Engineer für eine Kanzlei-OS Software (vergleichbar mit Harvey AI).
Deine Aufgabe: Vollständige Auditierung und Optimierung der DOCUMENT UPLOAD & PROCESSING ENGINE.

## Kontext
Subsumio ist eine Kanzlei-OS Software. Der Document Upload ist das HERZSTÜCK des Systems.
Akten müssen hochgeladen, semantisch aufgearbeitet und vorqualifiziert werden.
Danach werden mit diesen Daten Dokumente erstellt, Strategien im Chat besprochen, etc.

## Was du prüfen musst

### 1. Upload Pipeline (End-to-End)
- Lese `src/lib/upload-pipeline.ts`, `src/lib/upload-routing.ts`, `src/lib/upload-validation.ts`
- Lese `src/app/api/upload/route.ts` und alle Upload-API-Routes
- Lese `server/src/core/extract-document.ts` (48KB — Extraction Engine)
- Lese `server/src/commands/web-api.ts` → `runExtractionAndImport` Funktion
- Prüfe: Sync vs Async Path — sind beide Paths identisch in den Resultaten?
- Prüfe: Was passiert bei 50MB PDF? Bei 100MB? Bei verschlüsselten PDFs?
- Prüfe: Error Handling — PasswordRequiredError, InvalidDocumentPasswordError, UnsupportedUploadError
- Prüfe: Virus-Scan wird VOR Extraction ausgeführt?
- Prüfe: MIME-Type Validation — können bösartige Dateien als .pdf getarnt werden?

### 2. Document Splitting & Import
- Lese `splitAndImportLargeDocument` in `server/src/commands/web-api.ts`
- Prüfe: SPLIT_THRESHOLD (4MB) — ist das korrekt für Embedding-Limits?
- Prüfe: Parent-Child Page Relationship — sind alle Parts verlinkt?
- Prüfe: Embedding Status wird auf Parent UND allen Parts gesetzt?
- Prüfe: Tags werden auf Parent UND alle Parts angewendet?
- Prüfe: case_slug wird auf Parent UND alle Parts gestempelt?

### 3. Semantic Document Classification
- Lese `server/src/core/legal/doc-classifier.ts`
- Prüfe: Klassifizierungstypen (witness_statement, expert_report, medical_report, etc.)
- Prüfe: Confidence Scoring — ist es konservativ genug?
- Prüfe: Fallback auf `legal_document` bei Unklarheit?
- Prüfe: Wird doc_type in Frontmatter gestempelt für gefilterte Suche?

### 4. Auto-Trigger Legal Pipeline
- Lese `server/src/core/minions/handlers/legal-pipeline.ts` (64KB — 6-Layer Pipeline)
- Prüfe: Wird die Pipeline AUTOMATISCH nach Upload getriggert (für split docs)?
- Prüfe: Was passiert wenn Pipeline-Trigger fehlschlägt? Wird der User benachrichtigt?
- Prüfe: Human-in-the-Loop Checkpoint (pause_for_review) — funktioniert das?
- Prüfe: Layer 1-6 Sequenz — sind alle Layer korrekt verkettet?
- Prüfe: Retry-Logic bei Validation-Errors — funktioniert der Feedback-Loop?

### 5. Upload UI / UX
- Lese `src/app/dashboard/upload/page.tsx`
- Lese `src/components/presigned-uploader.tsx`
- Prüfe: Drag & Drop funktioniert?
- Prüfe: Progress-Indicator für große Dateien?
- Prüfe: Error States (Password required, Unsupported format, Virus detected)?
- Prüfe: Loading State während Extraction?
- Prüfe: Empty State (keine Dokumente)?
- Prüfe: Kann User Tags/Metadaten beim Upload setzen?
- Prüfe: Kann User eine Akte (case) beim Upload zuordnen?

### 6. Vault (Dokumenten-Verwaltung)
- Lese `src/app/dashboard/vault/page.tsx`
- Prüfe: Werden alle hochgeladenen Dokumente angezeigt?
- Prüfe: Filterung nach doc_type, case, tags, datum?
- Prüfe: Suche (Volltext + Semantisch)?
- Prüfe: Dokumenten-Vorschau?
- Prüfe: Bulk-Aktionen (Löschen, Taggen, Akte zuordnen)?
- Prüfe: Extraction Status wird angezeigt (processing/ready/failed)?

### 7. Cross-Layer Integration
- Prüfe: Upload → Extraction → Classification → Legal Pipeline → Brain Pages → Chat verfügbar
- Prüfe: Werden extrahierte Dokumente sofort im Chat/Assistant durchsuchbar?
- Prüfe: Werden Entities (Layer 2) im Case Overview angezeigt?
- Prüfe: Werden Fristen (Layer 4) im Deadlines Dashboard angezeigt?
- Prüfe: Werden Schadenspositionen (Layer 4) im Case angezeigt?
- Prüfe: Werden Drafts (Layer 5) im Drafting Dashboard angezeigt?

### 8. Edge Cases
- Leere Datei (0 bytes)
- Sehr große Datei (>50MB)
- Verschlüsselte PDF
- Scanned PDF (OCR needed)
- Audio-Datei (Transcription)
- Korrupte Datei
- Datei mit bösartigem Content (Embedded scripts in Office)
- Unicode/CJK Content
- Datei ohne Textlayer (Image-only PDF)

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Was bricht für den User
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 2: Legal Pipeline & AI Analysis Engine

### Scope

- `server/src/core/minions/handlers/legal-pipeline.ts` (64KB — 6-Layer Pipeline)
- `server/src/core/legal/analyze-document.ts` — Document Analysis
- `server/src/core/legal/document-review.ts` — Document Review
- `server/src/core/legal/risk-analysis.ts` — Risk Analysis
- `server/src/core/legal/deep-analysis.ts` — Deep Analysis (Bulk)
- `server/src/core/legal/contract-draft.ts` — Contract Drafting
- `server/src/core/legal/contract-redline.ts` — Contract Redlining
- `server/src/core/legal/due-diligence.ts` — Due Diligence
- `server/src/core/legal/memo.ts` — Memo Generation
- `server/src/core/legal/summarize.ts` — Summarization
- `server/src/core/legal/translate.ts` — Translation
- `server/src/core/legal/portfolio-insights.ts` — Portfolio Analytics
- `server/src/core/legal/obligation-extract.ts` — Obligation Extraction
- `server/src/core/legal/auto-playbook.ts` — Auto Playbook
- `server/src/core/legal/llm-util.ts` — LLM Utilities (Grounding, Validation)
- `server/src/core/legal/types.ts` — Legal Types
- `server/src/core/legal/repository.ts` — Legal Repository
- `server/src/core/legal/eval-framework.ts` — Eval Framework
- `server/src/core/legal/anonymizer.ts` — Anonymizer
- `server/src/core/legal/split-statute.ts` — Statute Splitter
- `src/app/api/legal/` (43 Routes) — Legal API Endpoints
- `src/app/dashboard/analyze/` — Document Analysis UI
- `src/app/dashboard/deep-analysis/` — Deep Analysis UI
- `src/app/dashboard/drafting/` — Drafting UI
- `src/app/dashboard/portfolio-insights/` — Portfolio Insights UI
- `src/app/dashboard/tabular-review/` — Tabular Review UI
- `src/components/legal/` (26 Components) — Legal UI Components
- `src/components/contract-redline-viewer.tsx` — Contract Redline Viewer

### Prompt

```
Du bist ein Principal Engineer für eine Kanzlei-OS Software (vergleichbar mit Harvey AI).
Deine Aufgabe: Vollständige Auditierung und Optimierung der LEGAL PIPELINE & AI ANALYSIS ENGINE.

## Kontext
Die 6-Layer Legal Pipeline ist das AI-Herzstück nach dem Upload:
- Layer 1: ON-Scanner (Haiku) → on_index page
- Layer 2: Entity-Extractor (Haiku) → entity pages
- Layer 3: Forensic Analyst (Sonnet) → forensic_report page
- Layer 4: Damage+Deadline Extractor (Sonnet) → damage_table + deadline_calendar
- Layer 5: Legal Drafter (Sonnet) → legal_draft pages (6 Pakete parallel)
- Layer 6: Legal Critic (Opus) → quality_audit page

Zusätzlich gibt es Standalone Legal AI Tools: Analyze, Review, Risk, Draft, Redline, Memo, Summarize, Translate, Due Diligence, Deep Analysis, Tabular Review, Portfolio Insights.

## Was du prüfen musst

### 1. Legal Pipeline (6-Layer)
- Lese `server/src/core/minions/handlers/legal-pipeline.ts` VOLLSTÄNDIG (64KB)
- Prüfe: Layer-Sequenz — sind alle 6 Layer korrekt implementiert?
- Prüfe: Map-Reduce Pattern — funktioniert Batch-Processing für große Dokumente?
- Prüfe: Cross-Layer Validation — werden Quotes gegen Originaltext validiert?
- Prüfe: Retry bei Validation-Errors — funktioniert der Feedback-Loop?
- Prüfe: Pipeline State Tracking — wird Status persistiert (running/completed/failed)?
- Prüfe: Human-in-the-Loop (pause_for_review) — funktioniert der Checkpoint?
- Prüfe: Resume Capability (resume_from_layer) — können Layers übersprungen werden?
- Prüfe: Budget Tracker — wird das AI-Kosten-Budget überwacht?
- Prüfe: Parallel Execution (Layer 5 — 6 Pakete parallel) — Concurrency-Limit?
- Prüfe: Error Recovery — was passiert wenn ein Layer crasht?

### 2. Grounding & Citation Quality
- Lese `server/src/core/legal/llm-util.ts`
- Prüfe: `groundQuotes` — werden alle Zitate gegen den Originaltext validiert?
- Prüfe: Werden ungrounded Zitate GELÖSCHT (nicht nur markiert)?
- Prüfe: `normalizeForMatch` — funktioniert das für Unicode/Whitespace?
- Prüfe: `tryParseJSON` — robust gegen LLM-Output mit Prosa drumherum?

### 3. Standalone Legal AI Tools
- Lese JEDES Module in `server/src/core/legal/`:
  - `analyze-document.ts` — Issue-Spotting mit Quote-Grounding
  - `document-review.ts` — Document Review (clauses, risks, compliance)
  - `risk-analysis.ts` — Clause-Level Risk Scoring (0-100)
  - `deep-analysis.ts` — Cross-Document Analysis (Bulk)
  - `contract-draft.ts` — Contract Drafting
  - `contract-redline.ts` — Contract Redlining
  - `due-diligence.ts` — Due Diligence
  - `memo.ts` — Memo Generation
  - `summarize.ts` — Summarization
  - `translate.ts` — Legal Translation
  - `portfolio-insights.ts` — Portfolio Analytics
  - `obligation-extract.ts` — Obligation Extraction
- Prüfe JEEDS Tool auf:
  - Input Validation (slug oder text required?)
  - Source Scoping (sourceId, matterScope)
  - Grounding (Zitate validiert?)
  - Error Handling (LLM unavailable, timeout, parse error)
  - Output Schema (strukturiertes JSON?)
  - Attorney Review Required Flag

### 4. API Routes → Engine Integration
- Lese `src/app/api/legal/` Routes (43 Routes)
- Lese `server/src/commands/web-api.ts` → Legal API Endpoints
- Prüfe: Ist jede API Route korrekt mit dem Engine-Endpoint verbunden?
- Prüfe: Matter Scope Enforcement — wird ACL durchgesetzt?
- Prüfe: Rate Limiting für AI-Heavy Endpoints?
- Prüfe: Request Size Limits (256kb-512kb)?
- Prüfe: Error Response Format konsistent?

### 5. Dashboard UI für Legal Tools
- Lese `src/app/dashboard/analyze/page.tsx`
- Lese `src/app/dashboard/deep-analysis/page.tsx`
- Lese `src/app/dashboard/drafting/page.tsx`
- Lese `src/app/dashboard/portfolio-insights/page.tsx`
- Lese `src/app/dashboard/tabular-review/page.tsx`
- Lese `src/components/legal/PipelinePanel.tsx`
- Lese `src/components/legal/DraftEditor.tsx`
- Lese `src/components/contract-redline-viewer.tsx`
- Prüfe: Loading States für AI-Operationen (können 30+ Sekunden dauern)
- Prüfe: Error States (LLM unavailable, timeout)
- Prüfe: Results Display (strukturiert, mit Zitaten, mit Links zu Source-Docs)
- Prüfe: Export-Funktion (PDF, DOCX, Markdown)?
- Prüfe: Kann User Feedback geben (Thumbs up/down, Retrieval Feedback)?

### 6. Cross-Layer Integration
- Prüfe: Pipeline-Output (ON-Index, Entities, Forensic Report) im Dashboard sichtbar?
- Prüfe: Können Pipeline-Results im Chat referenziert werden?
- Prüfe: Werden Fristen aus Layer 4 in Deadlines-Dashboard importiert?
- Prüfe: Werden Schadenspositionen aus Layer 4 im Case angezeigt?
- Prüfe: Werden Drafts aus Layer 5 im Drafting-Editor geöffnet?
- Prüfe: Werden Quality-Audit-Results aus Layer 6 angezeigt?

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Was bricht für den User
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 3: Chat & AI Assistant Layer

### Scope

- `src/app/dashboard/chat/` — Chat Dashboard (7 items: main, analytics, compare)
- `src/app/dashboard/assistant/` — Assistant Page
- `src/app/dashboard/query/` — Query Page
- `src/components/chat/` (13 Components) — Chat UI
- `src/lib/legal-chat/` (5 Module) — Legal Chat Engine
- `src/lib/legal-chat/actions.ts` (3158 Zeilen) — WhatsApp Chat Actions
- `src/lib/whatsapp/` (25 Module) — WhatsApp Integration
- `src/lib/whatsapp-natural-chat.ts` — Natural Language Chat
- `src/lib/whatsapp-kanzlei-os/` (8 Module) — WhatsApp Kanzlei OS
- `src/lib/sse-stream.ts` — SSE Streaming
- `src/lib/realtime.ts` — WebSocket Realtime
- `src/app/api/copilot/` — Copilot API
- `src/app/api/legal/research/` — Legal Research API
- `src/app/api/queries/` — Query API
- `src/app/api/think/` — Think API
- `server/src/core/think/` (7 Module) — Think Pipeline
- `server/src/core/context-engine.ts` — Context Engine

### Prompt

```
Du bist ein Principal Engineer für eine Kanzlei-OS Software (vergleichbar mit Harvey AI).
Deine Aufgabe: Vollständige Auditierung und Optimierung der CHAT & AI ASSISTANT LAYER.

## Kontext
Der Chat ist die zentrale Interaktionsfläche für Anwälte mit dem System.
Es gibt drei Chat-Interfaces:
1. Dashboard Chat (Web) — Vollwertiger AI-Chat mit Brain-Integration
2. Copilot Sidebar — Kontextueller Assistant in jeder Dashboard-Seite
3. WhatsApp Chat — Natural Language Interface für Mobile

## Was du prüfen musst

### 1. Dashboard Chat (Web)
- Lese `src/app/dashboard/chat/page.tsx` und alle Sub-Pages
- Lese `src/components/chat/chat-panel.tsx` (64KB — Hauptkomponente)
- Lese `src/components/chat/chat-input.tsx` — Input mit Voice-to-Prompt
- Lese `src/components/chat/chat-message.tsx` — Message Rendering
- Lese `src/components/chat/chat-header.tsx` — Header mit Session-Management
- Lese `src/components/chat/chat-session-store.ts` — Session Persistence
- Lese `src/components/chat/chat-types.ts` — Type Definitions
- Lese `src/components/chat/system-prompt.ts` — System Prompt Builder
- Lese `src/components/chat/tool-call-bubble.tsx` — Tool Call Display
- Lese `src/components/chat/model-comparison.tsx` — Model Comparison
- Prüfe: Streaming (SSE) funktioniert flüssig?
- Prüfe: Session Management (Create, Switch, Delete, Rename)?
- Prüfe: Context-Aware (welche Akte ist aktiv? Welche Dokumente?)
- Prüfe: Tool Calls werden angezeigt (Brain Search, Document Analysis, etc.)?
- Prüfe: Citations werden gerendert mit Links zu Source-Dokumenten?
- Prüfe: Can user select AI model (Haiku/Sonnet/Opus)?
- Prüfe: Can user compare models side-by-side?
- Prüfe: Chat Analytics (Token usage, cost, latency)?

### 2. Copilot Sidebar
- Lese `src/components/chat/copilot-sidebar.tsx` (47KB)
- Prüfe: Context-Aware (weiß auf welcher Dashboard-Seite der User ist)?
- Prüfe: Kann Copilot Aktionen ausführen (Case erstellen, Frist setzen)?
- Prüfe: Persistenz — bleibt Copilot-State über Page-Wechsel erhalten?
- Prüfe: Mobile-Verhalten (wird Copilot auf Mobile zum Full-Screen)?

### 3. WhatsApp Chat Engine
- Lese `src/lib/legal-chat/actions.ts` (3158 Zeilen) VOLLSTÄNDIG
- Lese `src/lib/whatsapp-natural-chat.ts`
- Lese `src/lib/whatsapp/` Module (25 Module)
- Prüfe: Intent Parsing — werden alle Intents korrekt erkannt?
  - time_entry, expense, case_note, deadline, task, appointment
  - case_summary, brain_query, rvg_calc, deadline_calc
  - conflict_check, document_fetch, list_cases, list_tasks
  - create_case, create_client, close_case, create_invoice
  - mark_done, update_task, delegate_task, cancel_deadline
  - review_document, bea_status, datev_status, search
  - financial_overview, case_activity
- Prüfe: Matter Scope Enforcement — kann ein User keine fremden Akten sehen?
- Prüfe: Ambiguous Case Resolution — was bei unklarer Aktenreferenz?
- Prüfe: Media Handling (Foto, Dokument, Audio)?
- Prüfe: Rate Limiting — Spam-Schutz?
- Prüfe: Audit Log — werden alle Aktionen geloggt?
- Prüfe: Error Recovery — was bei Engine-Ausfällen?

### 4. Context Engine
- Lese `server/src/core/context-engine.ts` (23KB)
- Prüfe: Wie wird Context für Chat gebaut (Brain Pages, Case, Documents)?
- Prüfe: Context Window Management — wird bei großen Akten gekürzt?
- Prüfe: RAG Integration — werden relevante Dokumente semantisch gesucht?
- Prüfe: Matter Context — ist der Chat auf die aktuelle Akte beschränkt?

### 5. SSE Streaming
- Lese `src/lib/sse-stream.ts`
- Prüfe: Reconnection bei Connection-Abbruch?
- Prüfe: Backpressure-Handling?
- Prüfe: Error-Events?
- Prüfe: Timeout-Handling?

### 6. Cross-Layer Integration
- Prüfe: Chat kann auf hochgeladene Dokumente zugreifen (Vault)?
- Prüfe: Chat kann Legal Tools triggern (Analyze, Summarize, Risk)?
- Prüfe: Chat kann Cases/Deadlines/Tasks erstellen?
- Prüfe: Chat-Ergebnisse können als Dokument gespeichert werden?
- Prüfe: Chat-Historie ist durchsuchbar?
- Prüfe: WhatsApp-Aktionen erscheinen im Dashboard (Audit Trail)?

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Was bricht für den User
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 4: Dashboard UI & UX (Kanzlei-OS Frontend)

### Scope

- `src/app/dashboard/` (80+ Seiten) — Alle Dashboard Pages
- `src/app/dashboard/layout.tsx` — Dashboard Layout (Sidebar, Topbar, Copilot)
- `src/components/dashboard/` (29 Components) — Dashboard Components
- `src/components/legal/` (26 Components) — Legal UI Components
- `src/components/ui/` (55 Components) — shadcn/ui Base Components
- `src/content/dashboard.ts` — i18n Strings (6380 Zeilen)
- `src/lib/use-lang.ts` — i18n Hook
- `src/lib/widget-registry.ts` — Widget Registry
- `src/lib/widget-dashboard.tsx` — Widget Dashboard
- `src/lib/queries/` (6 Module) — React Query Hooks

### Prompt

```
Du bist ein Principal Engineer und UX Lead für eine Kanzlei-OS Software (vergleichbar mit Harvey AI).
Deine Aufgabe: Vollständige Auditierung und Optimierung des DASHBOARD UI & UX.

## Kontext
Das Dashboard ist die Hauptarbeitsfläche für Anwälte. Es muss:
- Alle Kanzlei-Workflows abdecken (Akten, Fristen, Dokumente, Drafting, Billing)
- Schnell und intuitiv sein (Keyboard-Shortcuts, Command Palette)
- Responsive (Desktop, Tablet, Mobile)
- Accessible (WCAG 2.1 AA)
- Dark/Light Theme unterstützen
- Bilingual (DE/EN) mit i18n

## Was du prüfen musst

### 1. Dashboard Layout & Navigation
- Lese `src/app/dashboard/layout.tsx` VOLLSTÄNDIG
- Lese `src/components/dashboard/sidebar.tsx` (48KB — Navigation)
- Lese `src/components/dashboard/topbar.tsx` (39KB)
- Lese `src/components/dashboard/command-palette.tsx` (23KB)
- Lese `src/components/dashboard/mobile-tab-bar.tsx`
- Lese `src/components/dashboard/keyboard-shortcuts.tsx`
- Lese `src/components/dashboard/guided-tour.tsx`
- Prüfe: Sidebar — sind alle 80+ Seiten erreichbar (direkt oder via Filter)?
- Prüfe: Command Palette (Cmd+K) — sind alle Aktionen verfügbar?
- Prüfe: Keyboard Shortcuts — sind sie dokumentiert und funktional?
- Prüfe: Mobile Tab Bar — sind die 5 wichtigsten Aktionen erreichbar?
- Prüfe: Guided Tour — wird sie beim ersten Mal gestartet?
- Prüfe: Onboarding Flow — wird erzwungen vor erster Nutzung?

### 2. Core Dashboard Pages (CRITICAL)
Prüfe JEDE dieser Seiten auf Vollständigkeit:
- `/dashboard` — Overview (Widget Board)
- `/dashboard/cases` — Akten (CRUD, Detail, Timeline)
- `/dashboard/contacts` — Kontakte (CRUD, Conflict Check)
- `/dashboard/deadlines` — Fristen (CRUD, Calendar, Alerts)
- `/dashboard/intake` — Mandatsaufnahme (Form, Validation)
- `/dashboard/chat` — Chat (siehe Bereich 3)
- `/dashboard/vault` — Dokumente (siehe Bereich 1)
- `/dashboard/upload` — Upload (siehe Bereich 1)
- `/dashboard/drafting` — Schriftsatz (Editor, Templates)
- `/dashboard/invoicing` — Rechnungen (CRUD, PDF, DATEV)
- `/dashboard/compliance` — Compliance (GoBD, DSGVO, Retention)
- `/dashboard/settings` — Settings (Kanzlei, Security, AI Model, SCIM)

Für JEDE Seite prüfe:
- Loading State (Skeleton)
- Empty State (keine Daten)
- Error State (API failure)
- CRUD vollständig (Create, Read, Update, Delete)
- Search/Filter
- Pagination (bei großen Listen)
- Bulk Actions (wo relevant)
- Export (wo relevant)
- Accessibility (ARIA, Keyboard, Focus)
- i18n (alle Strings via useLang/t())
- Responsive (Mobile, Tablet)

### 3. Legal-Specific Dashboard Pages
- `/dashboard/analyze` — Dokument-Analyse
- `/dashboard/deep-analysis` — Deep Analysis
- `/dashboard/portfolio-insights` — Portfolio Insights
- `/dashboard/tabular-review` — Massen-Review
- `/dashboard/litigation` — Prozessführung
- `/dashboard/review-sets` — Review Sets
- `/dashboard/trust-accounting` — Treuhandkonto
- `/dashboard/litigation-analytics` — Prozess-Analytics
- `/dashboard/research` — Rechtsrecherche
- `/dashboard/rechtsprechung` — Rechtsprechung
- `/dashboard/norms` — Normen
- `/dashboard/precedent-search` — Präzedenzsuche
- `/dashboard/kollisionspruefung` — Kollisionsprüfung
- `/dashboard/cost-calculator` — Kostenrechner (RVG)
- `/dashboard/translate` — Übersetzung
- `/dashboard/signature` — e-Signatur
- `/dashboard/clause-library` — Klausel-Bibliothek
- `/dashboard/templates` — Vorlagen
- `/dashboard/obligation-tracking` — Obligation Tracking
- `/dashboard/process-strategy` — Prozess-Strategie

### 4. Widget Dashboard
- Lese `src/components/dashboard/widget-dashboard.tsx` (34KB)
- Lese `src/components/dashboard/widget-board.tsx` (19KB)
- Lese `src/lib/widget-registry.ts`
- Prüfe: Welche Widgets existieren?
- Prüfe: Kann User Widgets hinzufügen/entfernen/verschieben?
- Prüfe: Sind Widgets kontext-aware (welche Akte ist aktiv)?
- Prüfe: Widget Data Loading (React Query, Caching, Stale-While-Revalidate)?

### 5. Quick Create Dialogs
- Lese `src/components/legal/CaseQuickCreateDialog.tsx`
- Lese `src/components/legal/DeadlineQuickCreateDialog.tsx`
- Lese `src/components/legal/InvoiceQuickCreateDialog.tsx`
- Lese `src/components/legal/SignatureQuickCreateDialog.tsx`
- Lese `src/components/legal/ClauseQuickCreateDialog.tsx`
- Lese `src/components/legal/ContractQuickCreateDialog.tsx`
- Prüfe: Sind sie global verfügbar (via Custom Events)?
- Prüfe: Form Validation (Pflichtfelder, Format-Checks)?
- Prüfe: Success/Error Feedback?
- Prüfe: Keyboard Accessibility (Tab, Enter, Escape)?

### 6. Cross-Page Integration
- Prüfe: Von Case → Documents (Vault filtered by case)
- Prüfe: Von Case → Deadlines (filtered by case)
- Prüfe: Von Case → Chat (with case context)
- Prüfe: Von Document → Analyze (with document pre-selected)
- Prüfe: Von Deadlines → Calendar Export
- Prüfe: Von Invoice → DATEV Export
- Prüfe: Von Case → Litigation Flow
- Prüfe: Von Chat → Save as Document

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Was bricht für den User
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 5: API Layer & Backend Integration

### Scope

- `src/app/api/` (255+ Routes) — Alle API Routes
- `src/lib/api.ts` (49KB) — Client-Side API Wrapper
- `src/lib/api-handler.ts` (26KB) — API Handler Utility
- `src/lib/api-response.ts` — API Response Helper
- `src/lib/api-validation.ts` — API Validation
- `src/lib/engine.ts` — Engine Proxy (Web → Server)
- `src/lib/server-brain.ts` — Server Brain Resolution
- `src/middleware.ts` — Next.js Middleware (Auth, CSRF, Security Headers)
- `server/src/commands/web-api.ts` (6081 Zeilen) — Express API Server
- `server/src/core/operations.ts` (299KB) — 47+ Shared Operations

### Prompt

```
Du bist ein Principal Engineer für eine Kanzlei-OS Software.
Deine Aufgabe: Vollständige Auditierung und Optimierung der API LAYER & BACKEND INTEGRATION.

## Kontext
Die API Layer ist die Brücke zwischen Dashboard (Next.js) und GBrain Engine (Bun Server).
- Next.js API Routes → Express API (server/src/commands/web-api.ts)
- Client-Side: src/lib/api.ts (49KB) — Typed API Wrapper
- Server-Side: server/src/commands/web-api.ts (6081 Zeilen) — Express Server
- Shared Operations: server/src/core/operations.ts (299KB)

## Was du prüfen musst

### 1. API Route Audit
- Liste alle API Routes in `src/app/api/` auf
- Prüfe: Hat jede Route Auth-Check (Session oder API-Key)?
- Prüfe: Hat jede Route CSRF-Schutz?
- Prüfe: Hat jede Rate Limiting (wo nötig)?
- Prüfe: Input Validation (Zod oder manuell)?
- Prüfe: Error Response Format konsistent ({ error: string, message?: string })?
- Prüfe: HTTP Status Codes korrekt (200, 400, 401, 403, 404, 429, 500)?
- Prüfe: Response Type korrekt (JSON, SSE, Binary)?

### 2. Client API Wrapper (src/lib/api.ts)
- Lese `src/lib/api.ts` (49KB) VOLLSTÄNDIG
- Prüfe: Sind alle API Endpoints getyped?
- Prüfe: Error Handling — werden Network Errors, Timeouts, 4xx/5xx korrekt behandelt?
- Prüfe: Retry Logic für transiente Fehler?
- Prüfe: Auth Token Refresh bei 401?
- Prüfe: Request Cancellation (AbortController)?
- Prüfe: Base URL Konfiguration (ENV vs hardcoded)?

### 3. Engine Proxy
- Lese `src/lib/engine.ts` — Engine Proxy
- Lese `src/lib/server-brain.ts` — Brain Resolution
- Prüfe: Wie routen Web API Requests zur Engine?
- Prüfe: Matter Scope Headers — werden sie korrekt gesetzt?
- Prüfe: Source ID / Tenant ID — wird Multi-Tenancy durchgesetzt?
- Prüfe: Error Propagation — werden Engine Errors korrekt gemappt?

### 4. Middleware
- Lese `src/middleware.ts` VOLLSTÄNDIG
- Prüfe: Auth Check — welche Routes sind public, welche protected?
- Prüfe: CSRF Token Validation?
- Prüfe: Security Headers (CSP, HSTS, X-Frame-Options, etc.)?
- Prüfe: Rate Limiting auf Middleware-Level?
- Prüfe: Redirect Logic (login, onboarding)?

### 5. API Handler Utility
- Lese `src/lib/api-handler.ts` (26KB)
- Prüfe: Error Handling Pattern — konsistent über alle Routes?
- Prüfe: Zod Validation Integration?
- Prüfe: Auth Check Integration?
- Prüfe: Rate Limiting Integration?
- Prüfe: Audit Logging Integration?

### 6. Critical API Endpoints (Deep Audit)
Prüfe diese Endpoints besonders gründlich:
- `/api/upload` — File Upload (Security, Size Limits, Virus Scan)
- `/api/legal/analyze` — AI Analysis (Cost, Rate Limit, Timeout)
- `/api/legal/chat` — Chat (SSE Streaming, Context, Token Management)
- `/api/auth/*` — Auth (Session, OAuth, 2FA, Password Reset)
- `/api/cron/*` — Cron Jobs (Auth via CRON_SECRET, Error Handling)
- `/api/webhook` — Webhooks (Signature Verification, Idempotency)
- `/api/scim/*` — SCIM (Auth, RFC Compliance)
- `/api/docusign/*` — DocuSign (OAuth, Webhook Signatures)
- `/api/whatsapp/*` — WhatsApp (Webhook Verification, Rate Limit)

### 7. Cross-Layer Data Flow
- Prüfe: Dashboard → API → Engine → DB — ist der Flow konsistent?
- Prüfe: Werden Matter Scope / ACL Headers auf JEDER Ebene durchgesetzt?
- Prüfe: Werden Source IDs korrekt propagiert?
- Prüfe: Error Propagation — werden Engine Errors korrekt zum User kommuniziert?

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Was bricht für den User
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 6: GBrain Engine / Server Core

### Scope

- `server/src/core/engine.ts` (97KB) — BrainEngine Interface
- `server/src/core/postgres-engine.ts` (269KB) — Postgres + pgvector
- `server/src/core/pglite-engine.ts` (250KB) — PGLite (WASM)
- `server/src/core/operations.ts` (299KB) — 47+ Shared Operations
- `server/src/core/search/` (32 Module) — Hybrid Search Engine
- `server/src/core/ai/` (28 Module) — AI Gateway (Anthropic, OpenAI)
- `server/src/core/minions/` (52 Module) — Background Jobs
- `server/src/core/cycle/` (26 Module) — Brain Cycle / Dream Cycle
- `server/src/core/facts/` (13 Module) — Facts Extraction
- `server/src/core/ingestion/` (30 Module) — Content Ingestion
- `server/src/core/embedding.ts` — Embedding Engine
- `server/src/core/context-engine.ts` — Context Engine
- `server/src/core/brain-writer.ts` — Brain Page Writer
- `server/src/core/migrate.ts` (270KB) — Schema Migrations
- `server/src/core/config.ts` (40KB) — Configuration
- `server/src/core/db.ts` — Database Layer
- `server/src/core/acl.ts` — Access Control
- `server/src/core/matter-scope.ts` — Matter Scoping

### Prompt

```
Du bist ein Principal Engineer für eine Kanzlei-OS Software.
Deine Aufgabe: Vollständige Auditierung und Optimierung der GBRAIN ENGINE / SERVER CORE.

## Kontext
Die GBrain Engine ist das Backend-Herzstück. Sie verwaltet:
- Pages (Markdown-basierte Wissensbasis)
- Embeddings (pgvector für semantische Suche)
- AI Operations (Chat, Analyze, Extract via Anthropic/OpenAI)
- Background Jobs (Minions: Extract, Legal Pipeline, Embed Backfill)
- Brain Cycle (Dream Cycle: nächtliche Konsolidierung)
- Multi-Tenancy (Source IDs, Matter Scopes, ACLs)

## Was du prüfen musst

### 1. Engine Parity (Postgres vs PGLite)
- Lese `server/src/core/engine.ts` — Interface Definition
- Vergleiche `postgres-engine.ts` (269KB) mit `pglite-engine.ts` (250KB)
- Prüfe: Sind ALLE Methoden in BEIDEN Engines implementiert?
- Prüfe: Verhalten sie sich identisch (gleiche Results, gleiche Errors)?
- Prüfe: Schema-Migrationen in beiden Engines?
- Prüfe: Vector-Index (IVFFlat/HNSW) in beiden Engines?

### 2. Operations Contract
- Lese `server/src/core/operations.ts` (299KB) — STICHPROBENARTIG
- Prüfe: Hat jede Operation { name, description, params, returns, scope }?
- Prüfe: Trust Boundary (ctx.remote) — sind sicherheitsrelevante Ops geschützt?
- Prüfe: Source Isolation — verwenden alle Read-Ops `sourceScopeOpts(ctx)`?
- Prüfe: Error Handling — EngineError Hierarchy, keine bare Errors?

### 3. Search Engine
- Lese `server/src/core/search/hybrid.ts` (87KB) — STICHPROBEN
- Prüfe: Hybrid Search (Vector + Keyword + Graph) — funktioniert alle drei Modalitäten?
- Prüfe: Re-Ranking — wird es angewendet?
- Prüfe: Filter (doc_type, case_slug, tags, date_range)?
- Prüfe: Pagination — funktioniert bei großen Result-Sets?
- Prüfe: Source Scoping — keine Cross-Source Leaks?

### 4. AI Gateway
- Lese `server/src/core/ai/gateway.ts` (136KB) — STICHPROBEN
- Prüfe: Provider (Anthropic, OpenAI) — sind beide funktional?
- Prüfe: Fallback Logic — wenn Anthropic down ist, fällt es auf OpenAI zurück?
- Prüfe: Rate Limit Handling — werden 429s korrekt behandelt (Retry + Backoff)?
- Prüfe: Cost Tracking — werden Token-Kosten pro Request geloggt?
- Prüfe: Timeout Handling — gibt es harte Limits?
- Prüfe: Streaming (SSE) — funktioniert das für Chat?

### 5. Minion Queue (Background Jobs)
- Lese `server/src/core/minions/queue.ts` (61KB) — STICHPROBEN
- Lese `server/src/core/minions/worker.ts` (51KB) — STICHPROBEN
- Lese `server/src/core/minions/supervisor.ts` (47KB) — STICHPROBEN
- Prüfe: Job Persistence — überleben Jobs einen Server-Restart?
- Prüfe: Retry Logic — max_attempts, backoff strategy?
- Prüfe: Timeout Handling — werden hängende Jobs gekillt?
- Prüfe: Concurrency Control — wie viele Jobs parallel?
- Prüfe: Dead Letter Queue — was passiert mit permanent fehlgeschlagenen Jobs?
- Prüfe: Job Priority — gibt es eine Priority Queue?
- Prüfe: Worker Pool — wie wird der Pool gemanagt?

### 6. Brain Cycle (Dream Cycle)
- Lese `server/src/core/cycle.ts` (102KB) — STICHPROBEN
- Lese `server/src/core/cycle/` Module (26 Module)
- Prüfe: Was macht der Dream Cycle (Synthesize, Patterns, Consolidate)?
- Prüfe: Wann läuft er (Cron? Manual?)?
- Prüfe: Was passiert bei Fehler im Cycle?
- Prüfe: Wird der Cycle-Status im Dashboard angezeigt?

### 7. Multi-Tenancy & Security
- Lese `server/src/core/acl.ts` — Access Control
- Lese `server/src/core/matter-scope.ts` — Matter Scoping
- Lese `server/src/core/source-id.ts` — Source ID Management
- Prüfe: Können Tenant-Daten übergreifend geleakt werden?
- Prüfe: Matter Scope Enforcement auf DB-Ebene?
- Prüfe: ACL Groups — wie funktionieren sie?
- Prüfe: Ethical Walls — werden sie durchgesetzt?

### 8. Database & Migrations
- Lese `server/src/core/migrate.ts` (270KB) — STICHPROBEN
- Prüfe: Sind Migrations idempotent?
- Prüfe: Gibt es Rollback-Migrations?
- Prüfe: Schema-Versionierung?
- Prüfe: Index-Strategie (GIN für JSONB, IVFFlat/HNSW für Vector)?

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Was bricht für den User
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 7: Legal Domain Logic (Fristen, RVG, Recherche, Drafting)

### Scope

- `src/lib/legal-deadlines.ts` (23KB) — Fristberechnung (ZPO, BGB, VwGO)
- `src/lib/legal-types.ts` — Legal Type Definitions
- `src/lib/rvg.ts` — RVG Kostenberechnung
- `src/lib/ai-deadline-detect.ts` — AI Fristerkennung
- `src/lib/ai-act.ts` — AI Act Compliance
- `src/lib/groundedness.ts` — Groundedness Check
- `src/lib/legal-grounding.ts` — Legal Grounding
- `src/lib/citation-gate.ts` — Citation Gate
- `src/lib/privilege-labels.ts` — Privilege Labels
- `src/lib/data-classification.ts` — Data Classification
- `src/lib/legal-case-suggest.ts` — Case Suggestions
- `src/lib/regulatory-monitors.ts` — Regulatory Monitors
- `src/lib/efiling-architecture.ts` — e-Filing Architecture
- `law-corpus/` — Gesetzestexte (AT, CH, DE, EU)
- `src/app/dashboard/deadlines/` — Fristen UI
- `src/app/dashboard/cost-calculator/` — Kostenrechner UI
- `src/app/dashboard/research/` — Recherche UI
- `src/app/dashboard/rechtsprechung/` — Rechtsprechung UI
- `src/app/dashboard/norms/` — Normen UI
- `src/app/dashboard/kollisionspruefung/` — Kollisionsprüfung UI
- `src/app/dashboard/precedent-search/` — Präzedenzsuche UI

### Prompt

```
Du bist ein Principal Engineer mit Legal Domain Expertise für eine Kanzlei-OS Software.
Deine Aufgabe: Vollständige Auditierung und Optimierung der LEGAL DOMAIN LOGIC.

## Kontext
Die Legal Domain Logic ist das Fachwissen des Systems. Sie muss juristisch korrekt sein:
- Fristberechnung nach ZPO § 233, BGB §§ 187-193, VwGO § 60
- RVG Kostenberechnung nach RVG § 3, § 13, Anlage 1+2+3
- Rechtsrecherche in Gesetzestexten und Rechtsprechung
- Kollisionsprüfung (Mandant vs. Gegner, historische Mandate)
- e-Filing Architektur (elektronischer Rechtsverkehr)

## Was du prüfen musst

### 1. Fristberechnung
- Lese `src/lib/legal-deadlines.ts` (23KB) VOLLSTÄNDIG
- Lese `src/lib/legal-deadlines.test.ts` (36KB)
- Prüfe: ZPO § 233 (Notfristen) — korrekte Berechnung?
- Prüfe: BGB §§ 187-193 (Allgemeine Fristen) — korrekte Berechnung?
- Prüfe: VwGO § 60 (Verwaltungsgerichtliche Fristen)?
- Prüfe: Feiertagskalender — bundeslandspezifisch?
- Prüfe: Wochenend-Logik (Samstag/Sonntag → nächster Werktag)?
- Prüfe: Fristarten (Notfrist, Einspruchsfrist, Berufungsfrist, Wiedereinsetzungsfrist)?
- Prüfe: Edge Cases (Jahresfrist, Schaltjahr, Jahreswechsel)?
- Prüfe: AT und CH Fristen (anders als DE)?

### 2. RVG Kostenberechnung
- Lese `src/lib/rvg.ts` VOLLSTÄNDIG
- Lese `src/lib/rvg.test.ts`
- Prüfe: RVG § 3 (Streitwertberechnung)?
- Prüfe: RVG § 13 (Kosten in Angelegenheiten)?
- Prüfe: Anlage 1 (Vergütungsverzeichnis)?
- Prüfe: Anlage 2 (Auslagenpauschale)?
- Prüfe: Anlage 3 (Werte für Verfahren)?
- Prüfe: Edge Cases (Streitwert 0, sehr hoher Streitwert)?
- Prüfe: Aktualität der Tabelle (RVG 2021/2022/2023)?

### 3. AI Fristerkennung
- Lese `src/lib/ai-deadline-detect.ts` (7.5KB)
- Lese `src/lib/ai-deadline-detect.test.ts` (17.5KB)
- Prüfe: Wird Frist aus Dokumenttext extrahiert?
- Prüfe: Confidence Score — wird Low-Confidence markiert?
- Prüfe: Human Review für Low-Confidence Fristen?
- Prüfe: Wird erkannte Frist automatisch im Deadlines-Dashboard erstellt?

### 4. Rechtsrecherche
- Lese `src/app/dashboard/research/page.tsx`
- Lese `src/app/api/legal/research/route.ts`
- Prüfe: Hybrid Search (Vector + Keyword) in Gesetzestexten?
- Prüfe: Filterung nach Jurisdiktion (DE, AT, CH, EU)?
- Prüfe: Zitat-Links (§-Referenzen sind anklickbar)?
- Prüfe: Gesetzestexte aktuell (law-corpus/)?

### 5. Rechtsprechung & Präzedenzsuche
- Lese `src/app/dashboard/rechtsprechung/page.tsx`
- Lese `src/app/dashboard/precedent-search/page.tsx`
- Lese `src/lib/judgements.ts`
- Prüfe: Urteile-Sync — funktioniert der Import?
- Prüfe: Suche in Urteilen (Volltext + Semantisch)?
- Prüfe: Filter (Gericht, Datum, Rechtsgebiet)?
- Prüfe: Zitat-Extraktion aus Urteilen?

### 6. Kollisionsprüfung
- Lese `src/app/dashboard/kollisionspruefung/page.tsx`
- Lese `src/lib/contact-conflict.ts`
- Prüfe: Wird Mandant gegen alle existierenden Mandate geprüft?
- Prüfe: Wird Gegner gegen alle existierenden Mandate geprüft?
- Prüfe: Historische Mandate (abgeschlossene) — werden sie geprüft?
- Prüfe: Fuzzy Matching (Namensvarianten, Tippfehler)?
- Prüfe: Conflict Report — ist er verständlich und actionable?

### 7. Citation Gate & Grounding
- Lese `src/lib/citation-gate.ts` (10.9KB)
- Lese `src/lib/legal-grounding.ts` (7.6KB)
- Lese `src/lib/groundedness.ts` (2.3KB)
- Prüfe: Werden AI-Responses gegen Quellen validiert?
- Prüfe: Werden ungrounded Zitate entfernt?
- Prüfe: Citation Links — sind sie anklickbar und korrekt?

### 8. Cross-Layer Integration
- Prüfe: Fristen aus AI-Erkennung → Deadlines Dashboard → Calendar Export
- Prüfe: RVG-Berechnung → Invoice → DATEV Export
- Prüfe: Recherche → Chat (kann im Chat auf Gesetze verwiesen werden)?
- Prüfe: Kollisionsprüfung → Intake (wird bei Neumandat geprüft)?
- Prüfe: Privilege Labels → Review Sets → Document Production

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Was bricht für den User (juristische Korrektheit!)
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 8: Auth, Security & Compliance

### Scope

- `src/lib/auth/` (25 Module) — Session, OAuth, 2FA/TOTP, Lockout, Password
- `src/lib/permissions.ts` — RBAC Permission System
- `src/lib/ethical-wall.ts` — Ethical Walls
- `src/lib/encryption.ts` — AES-256-GCM Encryption
- `src/lib/csrf.ts` — CSRF Protection
- `src/lib/api-key-store.ts` — API Key Management
- `src/lib/totp.ts` — TOTP 2FA
- `src/lib/audit.ts` — Audit Logging
- `src/lib/audit-labels.ts` — Audit Action Labels
- `src/lib/gobd.ts` — GoBD Compliance
- `src/lib/gobd-verfahrensdoku.ts` — Verfahrensdokumentation
- `src/lib/data-classification.ts` — Data Classification
- `src/lib/privilege-labels.ts` — Privilege Labels
- `src/lib/ai-act.ts` — AI Act Compliance
- `src/lib/regulatory-monitors.ts` — Regulatory Monitors
- `src/lib/prompt-sanitizer.ts` — Prompt Injection Protection
- `src/lib/sanitize-html.ts` — HTML Sanitization
- `src/lib/virus-scan.ts` — Virus Scanning
- `src/lib/encryption.ts` — Encryption
- `src/lib/crypto-utils.ts` — Crypto Utils
- `src/lib/tenant-boundary.ts` — Tenant Boundary
- `src/lib/scim.ts` — SCIM 2.0
- `src/lib/workos.ts` — WorkOS SSO/SAML
- `src/middleware.ts` — Next.js Middleware
- `src/app/api/auth/` (15 Routes) — Auth API
- `src/app/api/scim/` (6 Routes) — SCIM API
- `src/app/api/2fa/` — 2FA API
- `src/app/api/api-keys/` — API Key API
- `src/app/api/acls/` (5 Routes) — ACL API
- `src/app/dashboard/compliance/` (7 items) — Compliance UI
- `src/app/dashboard/settings/security/` — Security Settings
- `src/app/dashboard/settings/scim/` — SCIM Settings
- `src/app/dashboard/audit/` — Audit Log UI
- `src/app/dashboard/verfahrensdoku/` — Verfahrensdoku UI
- `src/app/dashboard/anonymize/` — Anonymization UI
- `src/app/dashboard/data-export/` — Data Export UI

### Prompt

```
Du bist ein Principal Security Engineer für eine Kanzlei-OS Software (DACH-Markt).
Deine Aufgabe: Vollständige Auditierung und Optimierung der AUTH, SECURITY & COMPLIENCE Layer.

## Kontext
Subsumio verarbeitet sensible Mandantendaten. Es MUSS compliance-konform sein:
- DSGVO/GDPR (EU Datenschutz)
- BDSG (Bundesdatenschutzgesetz)
- BRAO (Bundesrechtsanwaltsordnung)
- BORA (Berufsordnung für Rechtsanwälte)
- GoBD (Grundsätze zur ordnungsmäßigen Führung und Aufbewahrung von Büchern)
- AI Act (EU AI Regulation)
- SCIM 2.0 (Enterprise User Management)
- SSO/SAML (Enterprise Auth)

## Was du prüfen musst

### 1. Authentication
- Lese `src/lib/auth/session.ts`, `src/lib/auth/session-core.ts`
- Lese `src/lib/auth/store.ts` (23KB) — Session Store
- Lise `src/lib/auth/tokens.ts` — Token Management
- Lese `src/lib/auth/password.ts` — Password Hashing
- Lese `src/lib/auth/lockout.ts` — Account Lockout
- Lese `src/lib/auth/rate-limit.ts` — Rate Limiting
- Lese `src/lib/totp.ts` — 2FA/TOTP
- Lese `src/lib/auth/backup-codes.ts` — Backup Codes
- Prüfe: Session Management (HttpOnly, Secure, SameSite Cookies)?
- Prüfe: Password Hashing (bcrypt/argon2, Salt, Cost Factor)?
- Prüfe: Account Lockout (nach wie vielen Versuchen, für wie lange)?
- Prüfe: Rate Limiting (Login, Password Reset, API)?
- Prüfe: 2FA/TOTP — ist es optional oder Pflicht?
- Prüfe: Backup Codes — sind sie sicher generiert?
- Prüfe: Session Expiry — wie lange gilt eine Session?
- Prüfe: Concurrent Sessions — sind sie erlaubt?

### 2. Authorization (RBAC + Ethical Walls)
- Lese `src/lib/permissions.ts` (9.8KB)
- Lese `src/lib/ethical-wall.ts` (9KB)
- Lese `src/lib/tenant-boundary.ts`
- Prüfe: Rollen (Admin, Lawyer, Paralegal, Read-Only)?
- Prüfe: Permission Checks — sind sie auf JEDER Ebene (API, Lib, Engine)?
- Prüfe: Ethical Walls — können Anwälte bestimmte Akten NICHT sehen?
- Prüfe: Matter Scope — ist ein User nur auf seine Akten beschränkt?
- Prüfe: API Key Permissions — sind sie scoped?

### 3. Encryption & Data Protection
- Lese `src/lib/encryption.ts` (4.4KB)
- Lese `src/lib/crypto-utils.ts`
- Lese `src/lib/auth/store-encryption.ts`
- Lese `src/lib/auth/sensitive-fields-encryption.ts`
- Prüfe: AES-256-GCM für sensible Daten?
- Prüfe: Key Management — wie werden Keys rotiert?
- Prüfe: Data at Rest — ist alles verschlüsselt?
- Prüfe: Data in Transit — HTTPS only?

### 4. CSRF & Input Protection
- Lese `src/lib/csrf.ts` (3.4KB)
- Lese `src/lib/prompt-sanitizer.ts` — Prompt Injection Protection
- Lese `src/lib/sanitize-html.ts` — XSS Protection
- Prüfe: CSRF Token — wird es bei jedem State-Changing Request validiert?
- Prüfe: Prompt Injection — werden User-Inputs sanitized bevor sie an LLM gehen?
- Prüfe: XSS — wird HTML Output sanitized?
- Prüfe: SQL Injection — werden alle Queries parametrisiert?

### 5. Audit Trail
- Lese `src/lib/audit.ts` (7.1KB)
- Lese `src/lib/audit-labels.ts` (6.4KB)
- Prüfe: Werden ALLE kritischen Aktionen geloggt (Create, Update, Delete, Login, Export)?
- Prüfe: Audit Log ist immutable (nicht manipulierbar)?
- Prüfe: Audit Log enthält User, Timestamp, Action, Resource, Details?
- Prüfe: Audit Log ist durchsuchbar und exportierbar?
- Prüfe: GoBD-konform (Verfahrensdokumentation)?

### 6. GoBD & Verfahrensdokumentation
- Lese `src/lib/gobd.ts` (4KB)
- Lese `src/lib/gobd-verfahrensdoku.ts` (5.3KB)
- Lese `src/app/dashboard/verfahrensdoku/page.tsx`
- Prüfe: Werden alle Änderungen protokolliert (Wer, Was, Wann)?
- Prüfe: Ist die Dokumentation maschinell auswertbar?
- Prüfe: Aufbewahrungsfristen eingestellt?

### 7. DSGVO/GDPR Compliance
- Lese `src/app/dashboard/anonymize/page.tsx`
- Lese `src/app/dashboard/data-export/page.tsx`
- Lese `src/app/dashboard/compliance/retention/page.tsx`
- Lese `server/src/core/legal/anonymizer.ts`
- Prüfe: Recht auf Auskunft (Data Export)?
- Prüfe: Recht auf Vergessenwerden (Anonymization/Deletion)?
- Prüfe: Löschfristen (Retention Rules)?
- Prüfe: Data Classification (welche Daten sind sensibel)?

### 8. Enterprise (SSO/SAML/SCIM)
- Lese `src/lib/workos.ts` — WorkOS SSO
- Lese `src/lib/scim.ts` (23KB) — SCIM 2.0
- Lese `src/app/api/scim/` — SCIM API
- Prüfe: SSO/SAML — funktioniert der Login Flow?
- Prüfe: SCIM 2.0 — User Provisioning/Deprovisioning?
- Prüfe: SCIM Groups — werden sie zu Permissions gemappt?
- Prüfe: JIT Provisioning (Just-in-Time User Creation)?

### 9. AI Act Compliance
- Lese `src/lib/ai-act.ts`
- Prüfe: Transparenz (User weiß, dass AI im Einsatz ist)?
- Prüfe: Human Oversight (keine autonomen Entscheidungen ohne Human Review)?
- Prüfe: Logging (AI-Entscheidungen nachvollziehbar)?

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Security/Compliance-Risiko
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 9: External Integrations (DMS, DocuSign, beA, WhatsApp, Email)

### Scope

- `src/lib/dms/` (8 Module) — DMS Connectors (SharePoint, NetDocuments, Box)
- `src/lib/docusign.ts` (14KB) — DocuSign e-Signature
- `src/app/api/docusign/` (8 Routes) — DocuSign API
- `src/lib/bea-import.ts` (9.9KB) — beA Import
- `src/app/api/bea/` — beA API
- `src/lib/whatsapp/` (25 Module) — WhatsApp Integration
- `src/app/api/whatsapp/` (7 Routes) — WhatsApp API
- `src/lib/email/` (3 Module) — Email Processing
- `src/app/api/email/` (8 Routes) — Email API
- `src/lib/email-parser.ts` — Email Parser
- `src/app/api/email-import/` — Email Import API
- `src/lib/connectors/` — Connector Coverage
- `src/app/api/connectors/` (5 Routes) — Connectors API
- `src/app/dashboard/connectors/` — Connectors UI
- `src/app/dashboard/bea/` — beA UI
- `src/app/dashboard/whatsapp/` (5 items) — WhatsApp UI
- `src/app/dashboard/email-import/` — Email Import UI
- `src/app/dashboard/signature/` — e-Signature UI
- `src/app/dashboard/word-addin/` — Word Add-in

### Prompt

```
Du bist ein Principal Engineer für eine Kanzlei-OS Software.
Deine Aufgabe: Vollständige Auditierung und Optimierung der EXTERNAL INTEGRATIONS.

## Kontext
Subsumio integriert mit externen Systemen, die für den Kanzlei-Alltag kritisch sind:
- DMS (SharePoint, NetDocuments, Box) — Dokumenten-Ablage
- DocuSign — Elektronische Unterschriften
- beA (besonderes elektronisches Anwaltspostfach) — Pflicht in DE
- WhatsApp — Client Communication
- Email — Client Communication
- Word Add-in — Drafting in Word

## Was du prüfen musst

### 1. DMS Connectors
- Lese `src/lib/dms/index.ts` — Factory Pattern
- Lese `src/lib/dms/sharepoint.ts` — SharePoint Connector
- Lese `src/lib/dms/netdocuments.ts` — NetDocuments Connector
- Lese `src/lib/dms/box.ts` — Box Connector
- Lese `src/lib/dms/imanager.ts` — Interface Definition
- Prüfe: Sind alle Connectors funktional (nicht nur Stubs)?
- Prüfe: Auth (OAuth2, API Keys) — sicher gespeichert?
- Prüfe: Upload/Download/List/Delete — alle CRUD Operations?
- Prüfe: Error Handling (API down, Auth expired, Rate Limit)?
- Prüfe: Kann User Connector im Dashboard konfigurieren?

### 2. DocuSign
- Lese `src/lib/docusign.ts` (14KB) VOLLSTÄNDIG
- Lese `src/app/api/docusign/` (8 Routes)
- Lese `src/app/dashboard/signature/page.tsx`
- Prüfe: OAuth Flow — funktioniert Auth + Token Refresh?
- Prüfe: Envelope Creation — wird Dokument korrekt gesendet?
- Prüfe: Webhook Handling — werden Status-Updates verarbeitet?
- Prüfe: Webhook Signature Verification — ist sie sicher?
- Prüfe: Signing Status im Dashboard sichtbar?
- Prüfe: Kann User Signatur-Platzierung sehen?

### 3. beA (Anwaltspostfach)
- Lese `src/lib/bea-import.ts` (9.9KB)
- Lese `src/app/api/bea/`
- Lese `src/app/dashboard/bea/page.tsx`
- Prüfe: Import funktioniert (Nachrichten abrufen)?
- Prüfe: Können Nachrichten gesendet werden?
- Prüfe: Auth (Client-Zertifikat) — wie wird es verwaltet?
- Prüfe: Anlagen-Download?
- Prüfe: Integration mit Vault (beA-Nachrichten als Dokumente)?

### 4. WhatsApp
- Lese `src/lib/whatsapp/` (25 Module) — STICHPROBEN
- Lese `src/app/api/whatsapp/` (7 Routes)
- Lese `src/app/dashboard/whatsapp/` (5 items)
- Prüfe: Webhook Verification (Meta/WhatsApp Signature)?
- Prüfe: Message Send/Receive — funktioniert End-to-End?
- Prüfe: Media Handling (Foto, Dokument, Audio)?
- Prüfe: Templates — sind sie Meta-approved?
- Prüfe: Rate Limiting (WhatsApp Business API Limits)?
- Prüfe: Natural Language Chat (siehe Bereich 3)?

### 5. Email
- Lese `src/lib/email/` (3 Module)
- Lese `src/lib/email-parser.ts` (7.1KB)
- Lese `src/app/api/email/` (8 Routes)
- Lese `src/app/api/email-import/`
- Prüfe: SMTP/IMAP Integration?
- Prüfe: Email Parsing (Headers, Body, Attachments)?
- Prüfe: HTML Email Sanitization (XSS)?
- Prüfe: Attachment Download + Virus Scan?
- Prüfe: Email → Vault Integration (Emails als Dokumente)?

### 6. Word Add-in
- Lese `word-addin/src/taskpane.ts`
- Lese `word-addin/manifest.xml`
- Prüfe: Funktional (Klausel-Bibliothek, Brain Search)?
- Prüfe: Auth (wie authentifiziert sich das Add-in)?
- Prüfe: Cross-Origin (CORS) korrekt konfiguriert?

### 7. Connector Coverage
- Lese `src/lib/connector-coverage.ts` (34KB)
- Prüfe: Welche Connectors sind verfügbar?
- Prüfe: Sind sie alle funktional oder nur Stubs?
- Prüfe: Kann User neue Connectors hinzufügen?

### 8. Cross-Layer Integration
- Prüfe: DMS → Vault (können DMS-Dokumente in Vault importiert werden)?
- Prüfe: DocuSign → Vault (unterschriebene Dokumente zurück im Vault)?
- Prüfe: beA → Vault (beA-Nachrichten als Dokumente)?
- Prüfe: WhatsApp → Vault (WhatsApp-Dokumente im Vault)?
- Prüfe: Email → Vault (Emails als Dokumente)?
- Prüfe: Alle externen Dokumente → Legal Pipeline (automatische Analyse)?

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Was bricht für den User
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 10: Billing, Operations & Kanzlei-Steuerung

### Scope

- `src/lib/billing/` (4 Module) — Subscription & Billing
- `src/lib/plans.ts` — Subscription Plans
- `src/lib/invoice-pdf.ts` — PDF Invoice Generation
- `src/lib/datev-export.ts` — DATEV Export
- `src/lib/datev-import.ts` — DATEV Import
- `src/lib/time-tracking.ts` — Time Tracking
- `src/lib/usage.ts` — Usage Tracking
- `src/lib/stripe-webhook.ts` — Stripe Webhook
- `src/lib/shared-spaces.ts` — Shared Spaces
- `src/lib/workflow.ts` — Workflow Engine
- `src/lib/approval.ts` — Approval System
- `src/lib/approval-execution.ts` — Approval Execution
- `src/lib/experience-layer.ts` — Experience/Profile Layer
- `src/lib/kanzlei-settings.ts` — Kanzlei Settings
- `src/lib/intake.ts` — Intake Logic
- `src/lib/intake-conversion.ts` — Intake Conversion
- `src/lib/release-gate.ts` — Release Gate
- `src/app/api/billing/` (7 Routes) — Billing API
- `src/app/api/invoices/` (3 Routes) — Invoice API
- `src/app/api/datev/` — DATEV API
- `src/app/api/time/` (4 Routes) — Time Tracking API
- `src/app/api/usage/` (2 Routes) — Usage API
- `src/app/api/approvals/` (2 Routes) — Approvals API
- `src/app/api/workflows/` — Workflows API
- `src/app/api/intake/` (2 Routes) — Intake API
- `src/app/api/shared-spaces/` (3 Routes) — Shared Spaces API
- `src/app/api/experience/` — Experience API
- `src/app/dashboard/invoicing/` — Invoicing UI
- `src/app/dashboard/cost-calculator/` — Cost Calculator UI
- `src/app/dashboard/datev-export/` — DATEV Export UI
- `src/app/dashboard/controlling/` — Controlling UI
- `src/app/dashboard/billing/` — Billing/Subscription UI
- `src/app/dashboard/intake/` — Intake UI
- `src/app/dashboard/workflows/` (5 items) — Workflows UI
- `src/app/dashboard/approvals/` — Approvals UI
- `src/app/dashboard/review-queue/` — Review Queue UI
- `src/app/dashboard/reports/` — Reports UI
- `src/app/dashboard/analytics/` — Analytics UI
- `src/app/dashboard/shared-spaces/` — Shared Spaces UI
- `src/app/dashboard/team/` — Team UI
- `src/app/dashboard/experience/` — Experience UI
- `src/app/dashboard/onboarding/` — Onboarding UI

### Prompt

```
Du bist ein Principal Engineer für eine Kanzlei-OS Software.
Deine Aufgabe: Vollständige Auditierung und Optimierung von BILLING, OPERATIONS & KANZLEI-STEUERUNG.

## Kontext
Diese Layer deckt den betriebswirtschaftlichen Teil der Kanzlei ab:
- Abrechnung (RVG, Stundensatz, Pauschale) → Rechnungen → DATEV Export
- Zeiterfassung (Time Tracking)
- Subscription/Billing (Stripe)
- Workflows (Kanzlei-Prozesse als Agent-Ketten)
- Approvals (Freigaben für AI-Aktionen)
- Onboarding (erste Einrichtung)
- Team-Management
- Controlling & Analytics

## Was du prüfen musst

### 1. Invoicing (Rechnungen)
- Lese `src/app/dashboard/invoicing/page.tsx`
- Lese `src/app/api/invoices/` (3 Routes)
- Lese `src/lib/invoice-pdf.ts` (6.6KB)
- Prüfe: CRUD vollständig (Create, Read, Update, Delete)?
- Prüfe: PDF-Generierung (korrektes Layout, USt, Brutto/Netto)?
- Prüfe: RVG-basierte Rechnung (Streitwert → Kosten)?
- Prüfe: Stundensatz-basierte Rechnung?
- Prüfe: Pauschal-Rechnung?
- Prüfe: Rechnungsnummer-Generierung (fortlaufend, eindeutig)?
- Prüfe: Status-Workflow (Draft → Sent → Paid → Overdue)?
- Prüfe: DATEV-Export aus Rechnung?

### 2. DATEV Export/Import
- Lese `src/lib/datev-export.ts` (4.1KB)
- Lese `src/lib/datev-import.ts` (11KB)
- Lese `src/app/dashboard/datev-export/page.tsx`
- Prüfe: Export-Format korrekt (DATEV-Konform)?
- Prüfe: Buchungssätze korrekt generiert?
- Prüfe: Kontenrahmen (SKR 03/04)?
- Prüfe: Import (Konten, Buchungen)?

### 3. Time Tracking
- Lese `src/lib/time-tracking.ts` (7.6KB)
- Lese `src/app/api/time/` (4 Routes)
- Prüfe: Timer Start/Stop/Pause?
- Prüfe: Manuelle Zeiterfassung?
- Prüfe: Zuordnung zu Akte (case_slug)?
- Prüfe: Billable vs. Non-Billable?
- Prüfe: Export (CSV, DATEV)?
- Prüfe: WhatsApp-Integration (Zeiterfassung via WhatsApp)?

### 4. Subscription & Billing (Stripe)
- Lese `src/lib/plans.ts` (11.7KB)
- Lese `src/lib/billing/` (4 Module)
- Lese `src/lib/stripe-webhook.ts`
- Lese `src/app/api/billing/` (7 Routes)
- Lese `src/app/dashboard/billing/page.tsx`
- Prüfe: Plan-Tiers (Free, Pro, Enterprise)?
- Prüfe: Stripe Integration (Checkout, Webhook, Portal)?
- Prüfe: Usage-based Billing (Token-Verbrauch)?
- Prüfe: Plan-Limits (Pages, Users, AI-Calls)?
- Prüfe: Upgrade/Downgrade Flow?
- Prüfe: Webhook Signature Verification?

### 5. Workflows
- Lese `src/lib/workflow.ts` (17KB)
- Lese `src/app/dashboard/workflows/` (5 items)
- Lese `src/app/api/workflows/`
- Prüfe: Workflow Templates (Due Diligence, Vertrags-Review, etc.)?
- Prüfe: Workflow Execution (Step-by-Step)?
- Prüfe: Conditional Branching (if/else in Workflow)?
- Prüfe: Status Tracking (pending, running, completed, failed)?
- Prüfe: Kann User eigene Workflows erstellen?

### 6. Approvals (Freigaben)
- Lese `src/lib/approval.ts` (4KB)
- Lese `src/lib/approval-execution.ts` (14.6KB)
- Lese `src/app/dashboard/approvals/page.tsx`
- Lese `src/app/dashboard/review-queue/page.tsx`
- Prüfe: Approval-Workflow (AI schlägt vor → Human prüft → Approve/Reject)?
- Prüfe: Welche Aktionen benötigen Approval?
- Prüfe: Notification bei ausstehender Approval?
- Prüfe: Audit Trail für Approvals?

### 7. Onboarding
- Lese `src/app/dashboard/onboarding/page.tsx`
- Lese `src/app/api/onboarding/`
- Prüfe: Wird Onboarding beim ersten Login erzwungen?
- Prüfe: Welche Schritte (Kanzlei-Name, Adresse, RVG, AI-Model, Team)?
- Prüfe: Kann Onboarding übersprungen werden?
- Prüfe: Wird Brain nach Onboarding initialisiert?

### 8. Team Management
- Lese `src/app/dashboard/team/page.tsx`
- Lese `src/app/api/team/` (2 Routes)
- Prüfe: User CRUD (Invite, Remove, Role Change)?
- Prüfe: Rollen (Admin, Lawyer, Paralegal)?
- Prüfe: Permissions pro Rolle?

### 9. Controlling & Analytics
- Lese `src/app/dashboard/controlling/page.tsx`
- Lese `src/app/dashboard/analytics/page.tsx`
- Lese `src/app/dashboard/reports/page.tsx`
- Prüfe: KPIs (Umsatz, Auslastung, Akten-Anzahl, Frist-Treue)?
- Prüfe: Charts (Revenue, Case Status, Time Distribution)?
- Prüfe: Export (PDF, Excel)?

### 10. Cross-Layer Integration
- Prüfe: Time Tracking → Invoice (Zeiten werden abrechenbar)
- Prüfe: Invoice → DATEV (Rechnungen werden exportiert)
- Prüfe: RVG Calculator → Invoice (Kosten → Rechnung)
- Prüfe: Case → Time Tracking (Aktenbezug)
- Prüfe: Case → Invoice (Aktenbezug)
- Prüfe: Workflow → Approval → Execution (vollständiger Chain)
- Prüfe: Onboarding → Brain Init → First Upload → First Analysis

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Was bricht für den User
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 11: Public Site & Marketing (SEO, Landing, Blog)

### Scope

- `src/app/page.tsx` — Landing Page
- `src/app/pricing/` — Pricing Page
- `src/app/about/` — About Page
- `src/app/features/` — Features Page
- `src/app/solutions/` (8 items) — Solution Pages
- `src/app/blog/` (3 items) — Blog
- `src/app/contact/` — Contact Page
- `src/app/cities/` (3 items) — City Pages (Local SEO)
- `src/app/de/`, `src/app/at/`, `src/app/ch/`, `src/app/en/` — Localized Pages
- `src/app/privacy/`, `src/app/terms/`, `src/app/imprint/` — Legal Pages
- `src/app/security/` — Security Page
- `src/app/download/` — Download Page
- `src/app/whatsapp/` — WhatsApp Landing
- `src/app/portal/` — Client Portal
- `src/components/marketing/` (31 Components) — Marketing Components
- `src/components/seo/` (2 Components) — SEO Components
- `src/content/blog.ts` — Blog Content
- `src/content/city-pages.ts` — City Page Content
- `src/lib/seo-keywords.ts` — SEO Keywords

### Prompt

```
Du bist ein Principal Engineer und SEO/UX Expert für eine Kanzlei-OS Software.
Deine Aufgabe: Vollständige Auditierung und Optimierung der PUBLIC SITE & MARKETING.

## Kontext
Die Public Site ist die erste Berührung mit potenziellen Kunden.
Sie muss: Konvertieren (Signup), Vertrauen wecken (Security, Compliance), SEO-optimiert sein.

## Was du prüfen musst

### 1. Landing Page
- Lese `src/app/page.tsx`
- Lise `src/components/marketing/` (31 Components) — STICHPROBEN
- Prüfe: Hero Section (klar Value Proposition, CTA)?
- Prüfe: Social Proof (Testimonials, Kundenlogos)?
- Prüfe: Feature Highlights (was macht Subsumio einzigartig)?
- Prüfe: CTA (Signup, Demo, WhatsApp)?
- Prüfe: Performance (LCP, FID, CLS)?
- Prüfe: Mobile-First Design?

### 2. Pricing Page
- Lese `src/app/pricing/page.tsx`
- Prüfe: Plan-Tiers klar dargestellt?
- Prüfe: Features pro Plan sichtbar?
- Prüfe: CTA (Signup pro Plan)?
- Prüfe: FAQ Section?

### 3. Localized Pages (DE/AT/CH/EN)
- Lese `src/app/de/`, `src/app/at/`, `src/app/ch/`, `src/app/en/`
- Prüfe: Sind alle Seiten übersetzt?
- Prüfe: Lokalisierung (Währung, Recht, Feiertage)?
- Prüfe: hreflang Tags korrekt?
- Prüfe: Sitemap enthält alle lokalisierten URLs?

### 4. City Pages (Local SEO)
- Lese `src/app/cities/` (3 items)
- Lese `src/content/city-pages.ts`
- Prüfe: Welche Städte sind abgedeckt?
- Prüfe: Unique Content pro Stadt (nicht Duplicate)?
- Prüfe: Local Schema Markup (LegalService)?

### 5. Blog
- Lese `src/app/blog/` (3 items)
- Lese `src/content/blog.ts`
- Prüfe: Blog Posts vorhanden?
- Prüfe: SEO (Meta Tags, Structured Data, Internal Links)?
- Prüfe: RSS Feed?

### 6. SEO Technical
- Lese `src/app/sitemap.ts`
- Lese `src/app/robots.ts`
- Lese `src/app/manifest.ts`
- Lese `src/lib/seo-keywords.ts`
- Prüfe: Sitemap vollständig (alle Pages)?
- Prüfe: Robots.txt korrekt (noindex für Dashboard)?
- Prüfe: Open Graph Tags?
- Prüfe: Schema Markup (Organization, SoftwareApplication)?
- Prüfe: Canonical URLs?

### 7. Legal Pages
- Lese `src/app/privacy/`, `src/app/terms/`, `src/app/imprint/`
- Prüfe: DSGVO-konforme Datenschutzerklärung?
- Prüfe: AGB vollständig?
- Prüfe: Impressum (Pflicht in DE/AT)?

### 8. Client Portal
- Lese `src/app/portal/`
- Lese `src/lib/portal-token.ts`
- Lese `src/app/api/portal/` (8 Routes)
- Prüfe: Wie kommen Mandanten ins Portal (Token-based)?
- Prüfe: Was können Mandanten sehen (Dokumente, Fristen, Rechnungen)?
- Prüfe: Security (Token Expiry, Rate Limit)?

### 9. Performance & Accessibility
- Prüfe: Lighthouse Score (Performance, Accessibility, SEO, Best Practices)?
- Prüfe: WCAG 2.1 AA Compliance?
- Prüfe: Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1)?

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Was bricht für den User/SEO
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 12: Cross-Layer Integration & E2E Workflows

### Scope

- ALLE Layer übergreifend
- End-to-End Userflows
- Datenkonsistenz zwischen Dashboard ↔ API ↔ Engine ↔ DB
- Workflow-Chain-Validation

### Prompt

```
Du bist ein Principal Engineer für eine Kanzlei-OS Software (vergleichbar mit Harvey AI).
Deine Aufgabe: CROSS-LAYER INTEGRATION AUDIT & END-TO-END WORKFLOW VALIDATION.

## Kontext
Subsumio ist ein Kanzlei-OS. Die einzelnen Module sind getestet, aber das
ZUSAMMENSPIEL muss 100% funktionieren. Jeder Workflow muss End-to-End durchspielbar sein.

## Was du prüfen musst

### 1. NEUMANDANT (Intake → Case → Upload → Analysis → Draft → Invoice)
Flow:
1. User geht zu /dashboard/intake → Neumandant Form
2. Kollisionsprüfung wird automatisch ausgeführt
3. Case wird erstellt (legal_case page in Brain)
4. User lädt Dokumente hoch (/dashboard/upload)
5. Document Extraction läuft (sync oder async)
6. Legal Pipeline wird getriggert (6-Layer)
7. ON-Index, Entities, Forensic Report werden erstellt
8. Fristen werden erkannt → Deadlines Dashboard
9. Schadenspositionen werden extrahiert → Case Overview
10. User diskutiert Strategie im Chat
11. User erstellt Schriftsatz (Drafting)
12. User sendet Rechnung (Invoicing)
13. User exportiert nach DATEV

Prüfe JEDE einzelne Transition:
- Intake → Case: Wird Case korrekt erstellt? Frontmatter korrekt?
- Case → Upload: Ist Case vorausgewählt beim Upload?
- Upload → Extraction: Wird Extraction getriggert? Status sichtbar?
- Extraction → Pipeline: Wird Pipeline automatisch getriggert?
- Pipeline → Pages: Werden alle Output-Pages erstellt?
- Pipeline → Deadlines: Werden Fristen im Dashboard sichtbar?
- Pipeline → Case Overview: Werden Entities/Schäden angezeigt?
- Chat → Brain: Kann Chat auf alle Akten-Dokumente zugreifen?
- Drafting → Export: Kann Draft als DOCX/PDF exportiert?
- Invoice → DATEV: Wird DATEV-Export korrekt generiert?

### 2. DOKUMENT-ANALYSE (Upload → Analyze → Risk → Memo → Chat)
Flow:
1. User lädt Vertrag hoch
2. User geht zu /dashboard/analyze → wählt Dokument
3. AI analysiert (Issues, Risks, Citations)
4. User geht zu /dashboard/deep-analysis → mehrere Dokumente
5. User erstellt Memo (/api/legal/memo)
6. User diskutiert Ergebnis im Chat
7. User speichert Chat-Ergebnis als Dokument

### 3. VERTRAGS-REVIEW (Upload → Redline → DocuSign → Vault)
Flow:
1. User lädt Vertrag hoch
2. User geht zu Contract Redline Viewer
3. AI markiert riskante Klauseln
4. User editiert Klauseln
5. User sendet via DocuSign zur Unterschrift
6. Unterschriebenes Dokument kommt zurück ins Vault

### 4. WHATSAPP WORKFLOW (Message → Intent → Action → Response → Audit)
Flow:
1. Mandant sendet WhatsApp Message
2. Webhook wird empfangen und verifiziert
3. Intent wird erkannt (z.B. "Frist für Akte 2026-014?")
4. Matter Scope wird geprüft
5. Action wird ausgeführt (Frist abrufen)
6. Response wird gesendet
7. Audit Log wird erstellt
8. Action erscheint im Dashboard

### 5. TEAM WORKFLOW (Assign → Work → Approve → Bill)
Flow:
1. Admin erstellt Task und weist zu
2. Lawyer sieht Task in Dashboard
3. Lawyer arbeitet an Task (Zeiterfassung)
4. Lawyer reicht Ergebnis ein (Approval)
5. Senior Lawyer prüft und approvet
6. Zeit wird abrechenbar
7. Invoice wird erstellt

### 6. COMPLIANCE WORKFLOW (GoBD → Audit → Retention → Export)
Flow:
1. Jede Aktion wird im Audit Log protokolliert
2. GoBD Verfahrensdokumentation wird geführt
3. Retention Rules werden angewendet
4. Data Export (DSGVO Auskunft)
5. Anonymization (DSGVO Löschung)

### 7. ENTERPRISE WORKFLOW (SSO → SCIM → Provision → Use)
Flow:
1. Admin konfiguriert SSO (WorkOS)
2. User login via SSO
3. SCIM provisioniert User
4. SCIM Groups → Permissions Mapping
5. User arbeitet im Dashboard
6. Admin deprovisioniert User via SCIM

### 8. DATA CONSISTENCY CHECKS
- Prüfe: Wenn Case gelöscht wird — was passiert mit Documents, Deadlines, Tasks?
- Prüfe: Wenn Document gelöscht wird — was passiert mit Embeddings, Pipeline-Results?
- Prüfe: Wenn User gelöscht wird — was passiert mit seinen Cases, Documents?
- Prüfe: Wenn Brain gewechselt wird — sind alle Daten korrekt scoped?
- Prüfe: Matter Scope Änderung — werden alle Caches invalidiert?

### 9. ERROR PROPAGATION CHAIN
- Prüfe: Engine Error → API Error → Dashboard Error Display
- Prüfe: LLM Timeout → User sieht sinnvolle Message
- Prüfe: DB Connection Loss → Graceful Degradation
- Prüfe: Webhook Failure → Retry Logic
- Prüfe: Cron Job Failure → Alerting

### 10. PERFORMANCE BOTTLENECKS
- Prüfe: N+1 Queries in Dashboard Pages
- Prüfe: Large API Responses (Pagination nötig?)
- Prüfe: Client-Side Caching (React Query staleTime)
- Prüfe: Server-Side Caching (Redis, In-Memory)
- Prüfe: Bundle Size (Code Splitting, Dynamic Imports)

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. WORKFLOW: Welcher Workflow ist betroffen
3. FILE: Pfad + Zeile
4. ISSUE: Beschreibung
5. IMPACT: Was bricht für den User
6. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Bereich 13: Testing, CI/CD & Production Readiness

### Scope

- `vitest.config.ts` — Vitest Configuration
- `playwright.config.ts` — Playwright E2E Config
- `tests/e2e-playwright/` (20 Specs) — E2E Tests
- `tests/e2e/` — E2E Smoke Tests
- `tests/heavy/` — Heavy Tests
- `tests/load/` — Load Tests
- `.github/workflows/` (5 Workflows) — CI/CD
- `eslint.config.mjs` — ESLint Config
- `tsconfig.json` — TypeScript Config
- `Dockerfile.web` — Docker Build
- `vercel.json` — Vercel Deployment
- `lighthouserc.json` — Lighthouse CI
- `playwright.config.ts` — Playwright Config
- `evals/` — Evaluation Frameworks
- `server/src/core/eval/` — Server-side Eval

### Prompt

```
Du bist ein Principal Engineer und QA Lead für eine Kanzlei-OS Software.
Deine Aufgabe: AUDIT DER TESTING, CI/CD & PRODUCTION READINESS.

## Kontext
Vor dem Online-Gang muss sichergestellt sein:
- Alle Tests passieren (Unit, Integration, E2E)
- CI/CD Pipeline ist robust
- Production Build ist fehlerfrei
- Performance Benchmarks sind eingehalten
- Security Scans sind clean

## Was du prüfen musst

### 1. Test Coverage
- Führe `npx vitest run` aus — alle Tests passing?
- Führe `npx tsc --noEmit` aus — 0 TypeScript Errors?
- Prüfe: Welche Module haben KEINE Tests?
- Prüfe: Sind Critical Paths (Upload, Auth, Legal Pipeline) getestet?
- Prüfe: E2E Tests (Playwright) — decken sie Hauptworkflows ab?
- Prüfe: Load Tests — gibt es Benchmarks?
- Prüfe: Eval Frameworks (RAG, Skill Optimization) — funktionieren sie?

### 2. CI/CD Pipeline
- Lese `.github/workflows/ci.yml`
- Lese `.github/workflows/e2e.yml`
- Lese `.github/workflows/heavy-tests.yml`
- Prüfe: Werden bei jedem PR alle Tests ausgeführt?
- Prüfe: Gibt es Linting (ESLint, Prettier)?
- Prüfe: Gibt es Security Scans (gitleaks, dependency audit)?
- Prüfe: Gibt es Build Verification?
- Prüfe: Gibt es Lighthouse CI?

### 3. Production Build
- Führe `npm run build` aus — erfolgreich?
- Prüfe: Bundle Size akzeptabel?
- Prüfe: Code Splitting (Dynamic Imports)?
- Prüfe: Tree Shaking effektiv?
- Prüfe: Source Maps (nicht in Production)?

### 4. Docker & Deployment
- Lese `Dockerfile.web`
- Lese `vercel.json`
- Prüfe: Docker Build reproduzierbar?
- Prüfe: Health Check Endpoint?
- Prüfe: Graceful Shutdown?
- Prüfe: Environment Variables dokumentiert (.env.example)?

### 5. Monitoring & Alerting
- Lese `src/app/api/health/`
- Lese `src/app/api/readiness/`
- Lese `src/app/dashboard/monitoring/` (5 items)
- Prüfe: Health Check Endpoint (DB, Engine, AI)?
- Prüfe: Readiness Check (alle Services verfügbar)?
- Prüfe: Error Tracking (Sentry o.ä.)?
- Prüfe: Uptime Monitoring?

### 6. Pre-Launch Checklist
- [ ] Alle Tests passing
- [ ] TypeScript 0 Errors
- [ ] Build erfolgreich
- [ ] ESLint 0 Errors
- [ ] Security Scan clean
- [ ] Lighthouse Score > 90
- [ ] E2E Tests passing
- [ ] Load Test bestanden
- [ ] Health Check grün
- [ ] Environment Variables dokumentiert
- [ ] Backup Strategy definiert
- [ ] Rollback Strategy definiert

### Output-Format
Für jeden gefundenen Issue:
1. SEVERITY: CRITICAL / HIGH / MEDIUM / LOW
2. FILE: Pfad + Zeile
3. ISSUE: Beschreibung
4. IMPACT: Production Readiness Risiko
5. FIX: Konkrete Lösung mit Code

Implementiere alle CRITICAL und HIGH Fixes direkt.
```

---

## Ausführungs-Strategie

### Reihenfolge (kritischste Bereiche zuerst)

| #   | Bereich                             | Priorität | Begründung                                                       |
| --- | ----------------------------------- | --------- | ---------------------------------------------------------------- |
| 1   | Document Upload & Processing Engine | **P0**    | Herzstück — ohne Upload nichts funktioniert                      |
| 2   | Legal Pipeline & AI Analysis        | **P0**    | AI-Features sind der Hauptwert                                   |
| 3   | Cross-Layer Integration & E2E       | **P0**    | Nur wenn das Zusammenspiel funktioniert, ist es production-ready |
| 4   | GBrain Engine / Server Core         | **P1**    | Backend-Stabilität                                               |
| 5   | API Layer & Backend Integration     | **P1**    | Brücke zwischen Frontend und Backend                             |
| 6   | Auth, Security & Compliance         | **P1**    | DACH-Compliance ist Pflicht                                      |
| 7   | Chat & AI Assistant Layer           | **P1**    | Hauptinteraktionsfläche                                          |
| 8   | Dashboard UI & UX                   | **P1**    | User Experience                                                  |
| 9   | Legal Domain Logic                  | **P2**    | Juristische Korrektheit                                          |
| 10  | External Integrations               | **P2**    | DMS, DocuSign, beA, WhatsApp                                     |
| 11  | Billing, Operations & Steuerung     | **P2**    | Betriebswirtschaft                                               |
| 12  | Public Site & Marketing             | **P3**    | SEO, Konvertierung                                               |
| 13  | Testing, CI/CD & Production         | **P0**    | Pre-Launch Gate                                                  |

### Agent-Zuweisung

Jeder Prompt ist so gestaltet, dass er einem separaten Agent gegeben werden kann.
Der Agent soll:

1. Den Bereich VOLLSTÄNDIG analysieren (nicht stichprobenartig)
2. Alle Issues nach Severity klassifizieren
3. CRITICAL und HIGH Fixes direkt implementieren
4. MEDIUM und LOW Issues dokumentieren
5. Cross-Layer-Abhängigkeiten beachten
6. Nach jedem Fix: `npx tsc --noEmit` und `npx vitest run` ausführen
