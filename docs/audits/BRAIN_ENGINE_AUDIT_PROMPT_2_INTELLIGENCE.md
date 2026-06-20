# Audit-Prompt 2: Subsumio Brain Engine — Intelligence Layer, Search, Legal Workflows & Fehlende Kanäle

> **Zweck:** Dieser Prompt ergänzt den ersten Audit (Ingestion-Pipeline) und prüft die eigentliche **Superintelligenz** des Brains: Think-Pipeline, Legal-Engine, Search/Retrieval-Qualität, Embedding-Pipeline, rechtsspezifische Workflows (Fristen, GoBD, Anonymisierung) und die fehlenden Kanäle (iCloud, Mobile, Word-Add-In).
>
> **Voraussetzung:** Erster Audit (`AUDIT_BRAIN_ENGINE_2026.md`) ist gelesen.

---

## 1. PRÜFUMFANG

### 1.1 Think-Pipeline (Superbrain Core)

Die Think-Pipeline ist das Herzstück der "Superintelligenz". Prüfe jeden Schritt:

**Datei:** `server/src/core/think/index.ts` (862 Zeilen)

**Pipeline-Schritte:**
1. **INTENT** — Frage-Klassifikation (general / temporal / entity / event)
2. **GATHER** — 4 parallele Retriever (hybrid, takes_kw, takes_vec, graph) → RRF-Fusion
3. **SYNTHESIZE** — LLM-Call mit strukturiertem Output (answer + citations + gaps)
4. **COMMIT** — Optional: Synthesis-Page persistieren + Evidence-Rows

**Prüfkriterien:**
- [ ] Ist die Intent-Klassifikation korrekt? (Zeile 189-195: einfache Regex, keine LLM-basierte Klassifikation)
- [ ] Ist die Gather-Phase vollständig? (4 Retriever parallel, RRF-Fusion, Dedup)
- [ ] Ist die Synthesize-Phase robust? (JSON-Parse-Fallback, Empty-Answer-Detection, `synthesisOk` Flag)
- [ ] Ist das Citation-Grounding korrekt? (Structured citations + Regex-Fallback für Inline-Marker)
- [ ] Ist das Legal-Mode-Prompt korrekt? (§-Citations mit Versionsdatum, Gerichtsentscheidungen, Jurisdiktions-Hinweise, attorney-review-disclaimer)
- [ ] Ist die Trajectory-Integration funktional? (v0.40.2: temporal/entity → findTrajectory, 5s Timeout, Concurrency Cap 3)
- [ ] Ist die Calibration-Integration korrekt? (Anti-bias, Brier-Score, Pattern-Statements)
- [ ] Ist das Streaming korrekt? (SSE, onStreamChunk, final JSON nach [DONE])
- [ ] Ist die Multi-Round-Scaffolding funktional? (Round >1 = gleicher Gather+Synth ohne Gap-Fill-Logik)
- [ ] Ist der SearchMode korrekt integriert? (conservative=10/10, balanced=25/20, tokenmax=50/30)

**Datei:** `server/src/core/think/gather.ts` (229 Zeilen)

**Prüfkriterien:**
- [ ] Sind alle 4 Retriever parallel? (Promise.all)
- [ ] Ist die RRF-Fusion korrekt? (k=60, gleiche Konstante wie hybrid.ts)
- [ ] Ist das Dedup korrekt? (by slug + row_num)
- [ ] Ist die Graph-Traversal korrekt? (anchor → subgraph, depth=2)
- [ ] Ist die Source-Scoping korrekt? (sourceId / sourceIds für Multi-Tenant)

**Datei:** `server/src/core/think/cite-render.ts` (187 Zeilen)

**Prüfkriterien:**
- [ ] Ist das Citation-Parsing korrekt? (Structured field → Fallback: Regex für [slug#row] und [slug])
- [ ] Ist die Citation-Validation korrekt? (validateCitationsAgainstContext — werden hallucinierte Slugs gefiltert?)
- [ ] Ist die Citation-Indexierung korrekt? (1-based, dedup by slug+row)

**Datei:** `server/src/core/think/prompt.ts` (246 Zeilen)

**Prüfkriterien:**
- [ ] Ist der System-Prompt korrekt? (Hard rules: cite every claim, weight<0.5 mark, conflicts surface, gaps explicit, no instructions)
- [ ] Ist der Legal-Mode-Prompt korrekt? (§-Citations mit Fassungsdatum, BGH-Format, Jurisdiktions-Flags, attorney-review, confidentiality)
- [ ] Ist der User-Message-Aufbau korrekt? (Default: question → pages → takes → graph → trajectory → instruction; Calibration: pages → takes → graph → calibration → trajectory → question → instruction)
- [ ] Ist die Calibration-Block-Formatierung korrekt? (holder, brier, patterns, bias-tags)

### 1.2 Legal-Engine (12 Module)

Prüfe jedes Legal-Engine-Modul auf Production-Readiness:

| Modul | Datei | Funktion | Status |
|-------|-------|----------|--------|
| **analyze-document** | `legal/analyze-document.ts` (230 Zeilen) | Proaktive Issue-Spotting mit Quote-Grounding | ❓ |
| **contract-draft** | `legal/contract-draft.ts` (134 Zeilen) | Vertragsentwurf mit Template-Seed | ❓ |
| **contract-redline** | `legal/contract-redline.ts` (297 Zeilen) | Tracked-Changes mit Playbook-Deviation | ❓ |
| **document-review** | `legal/document-review.ts` (196 Zeilen) | Q&A-Review mit verbatim Citations | ❓ |
| **due-diligence** | `legal/due-diligence.ts` (226 Zeilen) | Checklist-Driven DD mit Risk-Level | ❓ |
| **risk-analysis** | `legal/risk-analysis.ts` (196 Zeilen) | Clause-Level Risk Scoring (0-100) | ❓ |
| **memo** | `legal/memo.ts` (175 Zeilen) | Gutachten (Sachverhalt → Rechtsfragen → Würdigung → Ergebnis) | ❓ |
| **summarize** | `legal/summarize.ts` (160 Zeilen) | Executive Summary + Key Points | ❓ |
| **anonymizer** | `legal/anonymizer.ts` (393 Zeilen) | Pseudonymisierung (HMAC-SHA-256, DSGVO Art. 4 Nr. 5) | ❓ |
| **repository** | `legal/repository.ts` (545 Zeilen) | Legal Entities + Cases als Brain-Pages | ❓ |
| **split-statute** | `legal/split-statute.ts` (311 Zeilen) | Gesetzes-Parsing per § (DE/AT/CH) | ❓ |
| **llm-util** | `legal/llm-util.ts` (6757 bytes) | Shared Helpers (LegalLLM, clipText, tryParseJSON, jurisdictionLabel) | ❓ |

**Prüfkriterien pro Modul:**
- [ ] Ist das LLM-Interface korrekt injiziert? (LegalLLM für Testbarkeit ohne API-Key)
- [ ] Ist das Anti-Hallucination-Grounding korrekt? (Quote/Citation muss verbatim im Source-Text sein, ungrounded findings werden gedropped)
- [ ] Ist der `attorney_review_required: true` Flag immer gesetzt? (EU AI Act Art. 50)
- [ ] Ist der AI-Banner korrekt? (DE + EN Varianten)
- [ ] Ist die Jurisdiction-Unterstützung korrekt? (DE/AT/CH)
- [ ] Ist die Source-Scoping korrekt? (sourceId/sourceIds für Multi-Tenant)
- [ ] Ist das Error-Handling robust? (LLM-Ausfall → `NO_LLM_AVAILABLE` Warning + Empty Result, kein Crash)
- [ ] Ist das JSON-Parsing robust? (tryParseJSON mit Code-Fence-Stripping)
- [ ] Ist das `clipText`-Limit sinnvoll? (maxChars Default, Vermeidung von Context-Overflow)

**Spezifische Modul-Prüfungen:**

**analyze-document:**
- [ ] Wird jeder Issue mit einem verbatim `quote` versehen? (Zeile 27: `quote: string` required)
- [ ] Werden ungrounded Issues gedropped? (`groundIssues` Funktion)
- [ ] Sind die `relevant_statutes` korrekt formatiert? ("§ 1295 ABGB")
- [ ] Werden `key_dates` extrahiert? (date + what)

**contract-draft:**
- [ ] Wird das Template aus dem Brain korrekt geladen? (`loadPageText` mit sourceId)
- [ ] Sind Platzhalter in eckigen Klammern? (`[in eckigen Klammern]`)
- [ ] Werden keine spezifischen Beträge/Daten erfunden?

**contract-redline:**
- [ ] Ist die `original_clause` gegen den Source-Text grounded? (`normalizeForMatch`)
- [ ] Ist die Playbook-Deviation-Erkennung korrekt? (rule_id, clause_type, required_position, deviation_flag, severity)
- [ ] Sind die `change_type` Werte korrekt? (add/remove/modify)

**due-diligence:**
- [ ] Sind die Default-Checklisten korrekt? (M&A, Real Estate, Financing, General — DACH-typisch)
- [ ] Werden `page_refs` korrekt gesetzt? (Slug-Referenzen auf Quell-Dokumente)
- [ ] Sind `red_flags` und `recommendations` sinnvoll?

**risk-analysis:**
- [ ] Ist der 0-100 Score korrekt berechnet? (overall_score + overall_level)
- [ ] Sind `missing_clauses` korrekt? (Hinweise auf fehlende Klauseln)
- [ ] Ist die `legal_basis` korrekt? (§-Citation)

**memo:**
- [ ] Ist die Gutachten-Struktur korrekt? (Sachverhalt → Rechtsfragen → rechtliche Würdigung → Ergebnis)
- [ ] Ist der `depth`-Parameter korrekt? (brief/standard/comprehensive)
- [ ] Sind `statutes` korrekt referenziert?

**anonymizer:**
- [ ] Ist die Pseudonymisierung korrekt? (HMAC-SHA-256 mit Owner-Key, NICHT Anonymisierung i. S. v. DSGVO)
- [ ] Ist die `detectPII`-Funktion korrekt? (Names, Emails, Phone, Address, IBAN, Dates)
- [ ] Ist die `anonymizeFacts`-Funktion korrekt? (Replace mit Placeholders)
- [ ] Ist die `buildPlaceholders`-Funktion korrekt? ([ENT-01], [ENT-02], ...)
- [ ] Ist die `hashContact`-Funktion korrekt? (Reversible nur mit Owner-Key)
- [ ] Wird die terminologische Korrektheit gewahrt? ("pseudonymisiert", nicht "anonymisiert" in öffentlicher Doku)

**repository:**
- [ ] Sind Legal Entities als Brain-Pages korrekt gespeichert? (type='legal-entity')
- [ ] Sind Legal Cases als Brain-Pages korrekt gespeichert? (type='legal-case')
- [ ] Ist die Source-Isolation korrekt? (source_id pro Row, kein Cross-Source-Leak)
- [ ] Sind Evidence/Strategy/Outcome in Case-Frontmatter korrekt eingebettet?

**split-statute:**
- [ ] Ist das Parsing korrekt für §-Format (DE/AT)? (§ 1, § 1a, § 4h)
- [ ] Ist das Parsing korrekt für Art.-Format (CH)? (Art. 1 OR, Art. 2 ZGB)
- [ ] Ist die Frontmatter-Extraktion korrekt? (title, jurisdiction, abbreviation, version_date)
- [ ] Ist die Section-ID-Generierung korrekt? (p-1, p-1a, art-1)

### 1.3 Search & Retrieval

**Datei:** `server/src/core/search/hybrid.ts` (1969 Zeilen)

**Pipeline:** keyword + vector → RRF fusion → normalize → boost → cosine re-score → dedup → rerank → token-budget → autocut

**Prüfkriterien:**
- [ ] Ist die RRF-Fusion korrekt? (k=60, `score = sum(1/(60+rank))`)
- [ ] Ist der `COMPILED_TRUTH_BOOST` korrekt? (2.0x nach RRF-Normalisierung)
- [ ] Ist der Cosine-Re-Score korrekt? (0.7*rrf + 0.3*cosine)
- [ ] Ist die Query-Intent-Klassifikation korrekt? (`classifyQuery`, `autoDetectDetail`, `isAmbiguousModalityQuery`)
- [ ] Ist die Intent-Weighting korrekt? (`weightsForIntent` — unterschiedliche Gewichte für keyword vs. vector je Intent)
- [ ] Ist die Alias-Normalisierung korrekt? (`normalizeAlias`)
- [ ] Ist die Autocut-Funktion korrekt? (Schwellwert-basiertes Abschneiden)
- [ ] Ist die Adaptive-Return-Policy korrekt? (`resolveAdaptiveReturn`, `applyAdaptiveReturn`)
- [ ] Ist die Relational-Recall korrekt? (`buildRelationalArm` — SQL-basierte relationale Abfragen)
- [ ] Ist die Two-Pass-Expansion korrekt? (`expandAnchors`, `hydrateChunks`)
- [ ] Ist die Token-Budget-Enforcement korrekt? (`enforceTokenBudget`)
- [ ] Ist die Content-Flag-Stamping korrekt? (`stampContentFlags` — fuzzy/oversize markup warnings)
- [ ] Ist die Evidence-Stamping korrekt? (`stampEvidence`)
- [ ] Ist die Source-Boost-Funktion korrekt? (Source-spezifische Boosts)
- [ ] Ist die Recency-Decay-Funktion korrekt? (Zeit-basierter Decay für alte Ergebnisse)
- [ ] Ist die Query-Cache korrekt? (Semantic cache mit knobs_hash, similarity threshold, TTL)
- [ ] Ist die Mode-Switch-UX korrekt? (conservative/balanced/tokenmax mit klaren Knob-Sets)

**Datei:** `server/src/core/search/rerank.ts` (139 Zeilen)

**Prüfkriterien:**
- [ ] Ist der Reranker korrekt integriert? (Nach dedup, vor token-budget)
- [ ] Ist die Fail-Open-Posture korrekt? (Jeder Error → Original-Order, nie Throw)
- [ ] Ist das Audit-Logging korrekt? (`logRerankFailure` mit hashed query)
- [ ] Ist die topNIn/topNOut-Konfiguration korrekt? (Default 30, null = no truncate)

**Datei:** `server/src/core/search/mode.ts` (1129 Zeilen)

**Prüfkriterien:**
- [ ] Sind die 3 Mode-Bundles korrekt? (conservative, balanced, tokenmax)
- [ ] Ist die Resolution-Chain korrekt? (per-call opts → per-key config → MODE_BUNDLES[cfg] → balanced)
- [ ] Ist der knobsHash korrekt? (SHA-256 für Cache-Isolation zwischen Modes)
- [ ] Ist die Reranker-Timeout-Resolution korrekt? (Recipe-Lookup → config-key → mode-bundle)

**Datei:** `server/src/core/search/by-image.ts` (129 Zeilen)

**Prüfkriterien:**
- [ ] Ist die Image-Search korrekt? (image-only: embedQueryMultimodalImage → searchVector)
- [ ] Ist die Hybrid-Image+Text-Suche korrekt? (D13: parallel image+text → weighted RRF)
- [ ] Ist die Phase-3-Unified-Mode korrekt? (embedding_multimodal statt embedding_image)

### 1.4 Embedding-Pipeline

**Dateien:**
- `server/src/core/embedding.ts` (234 Zeilen) — Haupt-Delegation an Gateway
- `server/src/core/embed-stale.ts` (239 Zeilen) — Stale-Chunk Embedding Loop
- `server/src/core/search/embedding-column.ts` (25246 bytes) — Dynamic Embedding Column
- `server/src/core/contextual-retrieval-service.ts` — Contextual Retrieval
- `server/src/core/minions/handlers/embed-backfill.ts` — Backfill Handler
- `server/src/core/minions/handlers/contextual-reindex-per-chunk.ts` — Per-Chunk Reindex

**Prüfkriterien:**
- [ ] Ist die Embedding-Provider-Auswahl korrekt? (OpenAI, Voyage, DashScope, Zhipu, ZEmbed)
- [ ] Ist die Asymmetric-Embedding korrekt? (document-side vs. query-side, `input_type: 'query'`)
- [ ] Ist die Multimodal-Embedding korrekt? (Text + Image in shared embedding space)
- [ ] Ist die Stale-Embedding-Detection korrekt? (NULL embedding → stale; provenance signature mismatch → stale)
- [ ] Ist die Stale-Embedding-Recovery korrekt? (Cursor-paginated, source-grouped, rate-limit-aware, 429-backoff)
- [ ] Ist die Contextual-Retrieval korrekt? (Per-Chunk Context-Präfix vor Embedding)
- [ ] Ist der Backfill-Mechanismus korrekt? (Minion-Handler, progress tracking, crash-resumable)
- [ ] Ist die Dimension-Check korrekt? (Migration bei Dimensions-Wechsel)
- [ ] Ist das Embedding-Pricing korrekt? (lookupEmbeddingPrice für Cost-Tracking)
- [ ] Ist die Batch-Verarbeitung korrekt? (Batch-Size, Concurrency, AbortSignal)

### 1.5 AI-Gateway

**Datei:** `server/src/core/ai/gateway.ts` (135961 bytes — sehr groß!)

**Prüfkriterien:**
- [ ] Ist die Multi-Provider-Unterstützung korrekt? (Anthropic, OpenAI, Groq, DashScope, Zhipu, Voyage, lokal)
- [ ] Ist der Model-Resolver korrekt? (6-Tier-Chain: per-call → per-key config → recipe → env → default)
- [ ] Ist die OCR-Vision-Integration korrekt? (Vision-Model für Image-Extraction)
- [ ] Ist die Chat/Completion-API korrekt? (Streaming + Non-Streaming)
- [ ] Ist die Rerank-API korrekt? (Cross-Encoder, fail-open)
- [ ] Ist die Embedding-API korrekt? (Sync + Async, Batch, AbortSignal)
- [ ] Ist das Error-Handling korrekt? (AIConfigError, Rate-Limit, Timeout, Network)
- [ ] Ist das Retry/Backoff korrekt? (Exponential, Jitter, Max-Retries)
- [ ] Ist die Cost-Tracking korrekt? (Token-Count, Price-Lookup)
- [ ] Ist die Capability-Detection korrekt? (Model-Support für Vision, Tools, Streaming)

### 1.6 Fristen & Deadlines

**Dateien:**
- `src/lib/legal-deadlines.ts` (505 Zeilen) — Feiertags-Kalkulator (DE/AT/CH) + Fristberechnung
- `src/lib/ai-deadline-detect.ts` (208 Zeilen) — KI-gestützte Fristen-Erkennung

**Prüfkriterien legal-deadlines.ts:**
- [ ] Ist die Ostersonntag-Berechnung korrekt? (Gaußsche Osterformel)
- [ ] Sind alle deutschen Bundesländer korrekt? (16 BL-Codes)
- [ ] Sind alle 26 Schweizer Kantone korrekt?
- [ ] Ist Österreich korrekt? (AT als Bundesland-Code)
- [ ] Sind die Feiertage korrekt? (Bundesweit + regional)
- [ ] Ist die Fristberechnung korrekt? (§ 222 Abs. 2 ZPO / § 193 BGB: Fristende verschiebt sich auf nächsten Werktag bei Samstag/Sonntag/Feiertag)
- [ ] Ist die Holiday-Cache korrekt? (Per year+state+canton)
- [ ] Ist die `DeadlineStatus`-Logik korrekt? (pending/warning/critical/overdue/done)
- [ ] Ist die Warning-Schwelle korrekt? (7 Tage)
- [ ] Ist die Critical-Schwelle korrekt? (3 Tage)

**Prüfkriterien ai-deadline-detect.ts:**
- [ ] Ist die Regex-Erkennung korrekt für absolute DE-Daten? ("bis 30.06.2024")
- [ ] Ist die Regex-Erkennung korrekt für absolute AT-Daten? ("bis 30. 6. 2024")
- [ ] Ist die Regex-Erkennung korrekt für relative Fristen? ("innerhalb von 14 Tagen")
- [ ] Ist die Regex-Erkennung korrekt für gesetzliche Fristen? (Klageerwiderung, Berufungsfrist)
- [ ] Ist die KI-API-Fallback-Korrektheit gewährleistet? (Für komplexe Formulierungen)
- [ ] Ist die `confidence`-Einstufung korrekt? (high/medium/low)
- [ ] Ist die `suggestedTemplate`-Zuordnung korrekt? (zpo-klageerwiderung etc.)
- [ ] Ist die `sourceSnippet`-Extraktion korrekt? (Verbatim Text um die Frist)

### 1.7 GoBD & Compliance

**Dateien:**
- `src/lib/gobd.ts` (103 Zeilen) — GoBD-Bausteine (Hash, Retention)
- `src/lib/gobd-verfahrensdoku.ts` (141 Zeilen) — Verfahrensdokumentations-Generator

**Prüfkriterien gobd.ts:**
- [ ] Ist die Aufbewahrungsfrist korrekt? (10 Jahre, § 147 Abs. 3 AO)
- [ ] Ist die `retentionUntil`-Funktion korrekt? (heute + 10 Jahre)
- [ ] Ist die `sha256Hex`-Funktion korrekt? (Manipulations-Evidenz)
- [ ] Ist die `sha256HexBytes`-Funktion korrekt? (Für Datei-Uploads, PDF/Bild)
- [ ] Sind die `InvoiceHashFields` korrekt? (number, client, caseNumber, date, subtotal, expenseTotal, advancePayment, tax)
- [ ] Ist die Ehrlichkeitsregel eingehalten? (Technische Bausteine ≠ volle GoBD-Konformität)

**Prüfkriterien gobd-verfahrensdoku.ts:**
- [ ] Sind die 4 GoBD-Teile korrekt? (Allgemeine Beschreibung, Anwenderdokumentation, technische Systemdokumentation, Betriebsdokumentation)
- [ ] Ist die Änderungshistorie/IKS korrekt?
- [ ] Sind die Platzhalter korrekt? (`_[bitte ergänzen / vom Berater prüfen lassen]_`)
- [ ] Ist die Ehrlichkeitsregel eingehalten? (Vorlage, kein prüfungssicheres Dokument)

### 1.8 WhatsApp Legal Chat

**Datei:** `src/lib/legal-chat/actions.ts` (844 Zeilen)

**Prüfkriterien:**
- [ ] Ist die Intent-Parsing-Korrektheit gewährleistet? (help, confirm, cancel, time_entry, expense, case_note, invoice_status, task, deadline, case_summary, brain_query, unknown)
- [ ] Ist das Case-Matching korrekt? (caseRef → Case-Slug Resolution)
- [ ] Ist die Time-Entry-Erfassung korrekt? (minutes, caseRef, description, billable)
- [ ] Ist die Expense-Erfassung korrekt? (amount, caseRef, description, billable)
- [ ] Ist die Deadline-Erfassung korrekt? (caseRef, title, dueDate)
- [ ] Ist die Case-Summary korrekt? (brain_query → Think-Pipeline)
- [ ] Ist die Brain-Query korrekt? (query → Think-Pipeline)
- [ ] Ist die Engine-Request-Funktion korrekt? (brainId-Scoping, Error-Handling)
- [ ] Ist die Page-Erstellung korrekt? (slug, title, type, content, frontmatter, merge)

### 1.9 Fehlende Kanäle

#### 1.9.1 iCloud Integration

**Status:** Völlig fehlt. Kein Connector, keine Erwähnung im Code (außer `capacitor.config.ts` für iOS-App).

**Prüfung:**
- [ ] Wird iCloud Drive benötigt? (Apple CloudKit API / iCloud Drive API)
- [ ] Wird iCloud Mail benötigt? (IMAP mit app-spezifischem Password)
- [ ] Wie sollte ein iCloud-Connector aussehen?
- [ ] Welche Auth-Mechanismen sind nötig? (Apple ID OAuth2, app-specific password für IMAP)
- [ ] Welche Scope-Einschränkungen gibt es? (Apple ist restriktiv bei iCloud Drive API)
- [ ] Ist die iCloud-Integration für Kanzleien überhaupt relevant? (vs. Google/Dropbox)

**Empfehlung evaluieren:**
- iCloud Drive: Nur über Apple Business Connect API oder File Provider Extension (iOS native)
- iCloud Mail: IMAP mit app-spezifischem Password (kein OAuth2 für Consumer)
- Alternative: Mandanten nutzen iCloud → Export zu Google Drive / Dropbox → bestehende Connectoren

#### 1.9.2 Mobile (Capacitor)

**Datei:** `capacitor.config.ts`, `mobile/README.md`

**Prüfkriterien:**
- [ ] Ist die Capacitor-Config korrekt? (serverUrl, appId, appName)
- [ ] Ist die Build-Pipeline dokumentiert? (iOS/Android)
- [ ] Gibt es native Plugins? (Push, Biometrie, Camera, Share-Extension)
- [ ] Gibt es eine Scanner-Integration? (Document-Scanner via Camera)
- [ ] Gibt es eine Share-Extension? ("An Subsumio senden" aus anderen Apps)
- [ ] Gibt es Offline-Support? (Cached Brain-Pages, Sync bei Online)
- [ ] Gibt es Biometrie-Auth? (FaceID/TouchID für Kanzlei-Security)
- [ ] Ist der App-Store-Submission-Prozess dokumentiert?

#### 1.9.3 Word-Add-In

**Datei:** `word-addin/src/taskpane.ts`, `word-addin/manifest.xml`

**Prüfkriterien:**
- [ ] Ist die API-URL konfigurierbar? (Aktuell: hardcoded `https://sigmabrain.com`)
- [ ] Ist das Token-Management korrekt? (Aktuell: kein Refresh)
- [ ] Gibt es eine Upload-Funktion? (Dokument → Brain)
- [ ] Ist die Fehlerbehandlung korrekt? (Network-Timeouts, 401, 403)
- [ ] Ist die Office-CoercionType korrekt? (Aktuell: nur Text, kein formatierter Text)
- [ ] Ist die Manifest-XML korrekt? (Version, Provider, Hosts, Permissions)
- [ ] Ist die Cross-Platform-Kompatibilität gewährleistet? (Office Online vs. Desktop)

### 1.10 Frontend Legal Integration

**Dateien:**
- `src/lib/legal-types.ts` — Type-Definitions
- `src/lib/schemas/legal.ts` — Zod-Schemas
- `src/lib/legal-chat/actions.ts` — WhatsApp Legal Chat Actions
- `src/app/api/legal/` — 18 API-Routes für Legal-Features

**Prüfkriterien:**
- [ ] Sind alle Legal-Engine-Module über API-Routes erreichbar?
- [ ] Sind die API-Routes korrekt abgesichert? (Auth, RBAC, Rate-Limit, Quota)
- [ ] Ist die Frontend-UI für Legal-Features korrekt? (Memo, Contract-Draft, Redline, Risk-Analysis, etc.)
- [ ] Ist die Ergebnis-Präsentation korrekt? (AI-Banner, attorney-review-warning, citations)
- [ ] Ist die Fehler-Präsentation korrekt? (NO_LLM_AVAILABLE, LLM_CALL_FAILED, etc.)

---

## 2. PRÜFKRITERIEN (übergreifend)

### 2.1 Anti-Hallucination-Guarantee

Die wichtigste Garantie für eine Kanzlei-Software. Prüfe systematisch:

- [ ] **Think-Pipeline:** Jede Citation muss auf eine existierende Brain-Page verweisen (validateCitationsAgainstContext)
- [ ] **analyze-document:** Jeder Issue muss einen verbatim `quote` aus dem Dokument tragen (groundIssues)
- [ ] **contract-redline:** Jede `original_clause` muss im Source-Text gefunden werden (normalizeForMatch)
- [ ] **document-review:** Jede `citation` muss verbatim im Dokument stehen
- [ ] **risk-analysis:** Jedes `text_excerpt` muss gegen den Source-Text grounded sein
- [ ] **due-diligence:** Jedes `page_refs` muss auf eine existierende Brain-Page verweisen
- [ ] **memo:** Explizit NICHT quote-grounded (generativ), aber `statutes` müssen referenziert sein
- [ ] **summarize:** Explizit NICHT quote-grounded (paraphrasing), aber `attorney_review_required: true`

**Frage:** Kann das System jemals eine falsche juristische Schlussfolgerung als "fact" präsentieren?

### 2.2 Multi-Tenant-Isolation

- [ ] Think-Pipeline: `sourceId` / `sourceIds` / `allowedSources` korrekt durchgereicht?
- [ ] Legal-Engine: `sourceId` / `sourceIds` bei `loadPageText` und `resolveDocumentText` korrekt?
- [ ] Search: Source-Filter in `hybridSearch` korrekt?
- [ ] Embedding: Source-Gruppierung in `embedStale` korrekt?
- [ ] Repository: `source_id` pro Row in Legal Entities/Cases?

### 2.3 DACH-Rechtsraum-Abdeckung

- [ ] DE: BGB, ZPO, StPO, EStG, AO, HGB, GWB, RVG — abgedeckt?
- [ ] AT: ABGB, ZPO, StPO, UStG, BAO — abgedeckt?
- [ ] CH: OR, ZGB, StGB, ZPO — abgedeckt?
- [ ] EU: AEUV, GR-Charta, DSGVO, AI Act — abgedeckt?
- [ ] Sind Gesetze aktuell? (split-statute mit version_date)
- [ ] Sind Rechtsprechungs-Connectoren aktuell? (RIS-OGD, OpenLegalData, OpenCaseLaw, EUR-Lex)

### 2.4 Performance & Latency

- [ ] Think-Pipeline: Wie lange dauert ein typischer Think-Call? (Gather + Synth)
- [ ] Legal-Engine: Wie lange dauert analyze-document? (LLM-Call-Dauer)
- [ ] Search: Wie lange dauert hybridSearch? (Vector + Keyword + RRF + Rerank)
- [ ] Embedding: Wie lange dauert embedStale für 1000 Chunks?
- [ ] Gibt es Caching? (Query-Cache, Result-Cache, Embedding-Cache)

### 2.5 Cost-Management

- [ ] Think-Pipeline: Token-Verbrauch pro Call? (System-Prompt + Pages + Takes + Output)
- [ ] Legal-Engine: Token-Verbrauch pro Modul?
- [ ] Search: Embedding-Cost pro Query?
- [ ] Rerank: Cost pro Rerank-Call?
- [ ] Gibt es Cost-Tracking? (Token-Count, Price-Lookup, Budget-Tracker)

---

## 3. ARCHITEKTUR-DIAGRAMM (Intelligence Layer)

```
User Question / Document
  ↓
Think-Pipeline (INTENT → GATHER → SYNTHESIZE → COMMIT)
  ├── Gather: hybridSearch + takesSearch + graphTraversal
  │   ├── hybridSearch: keyword + vector → RRF → boost → cosine → dedup → rerank → token-budget → autocut
  │   ├── takesSearch: keyword + vector (takes table)
  │   └── graphTraversal: anchor → subgraph (depth=2)
  ├── Synthesize: LLM-Call (system prompt + pages + takes + graph + trajectory + calibration)
  │   ├── Legal-Mode: §-citations, jurisdiction, attorney-review
  │   └── Citation-Grounding: structured + regex fallback → validateAgainstContext
  └── Commit: persist synthesis page + evidence rows

Legal-Engine (12 Module)
  ├── analyze-document: issue-spotting with quote-grounding
  ├── contract-draft: generative with template-seed
  ├── contract-redline: tracked-changes with playbook-deviation
  ├── document-review: Q&A with verbatim citations
  ├── due-diligence: checklist-driven with risk-level
  ├── risk-analysis: clause-level scoring (0-100)
  ├── memo: gutachten (Sachverhalt → Würdigung → Ergebnis)
  ├── summarize: executive summary + key points
  ├── anonymizer: HMAC pseudonymization (DSGVO Art. 4 Nr. 5)
  ├── repository: legal entities + cases as brain pages
  ├── split-statute: §-level statute parsing (DE/AT/CH)
  └── llm-util: shared helpers

AI-Gateway (Multi-Provider)
  ├── Chat: Anthropic, OpenAI, Groq, DashScope, Zhipu, local
  ├── Embedding: OpenAI, Voyage, DashScope, Zhipu, ZEmbed
  ├── Rerank: Cross-Encoder (fail-open)
  ├── OCR: Vision-Model (pdf2pic + image)
  └── Model-Resolver: 6-tier chain

Search & Retrieval
  ├── Hybrid: keyword + vector → RRF → boost → cosine → dedup → rerank
  ├── Image: multimodal embedding (image + text refinement)
  ├── Mode-Bundles: conservative / balanced / tokenmax
  ├── Query-Cache: semantic cache with knobs_hash
  └── Contextual-Retrieval: per-chunk context prefix

Embedding-Pipeline
  ├── embed: document-side (asymmetric)
  ├── embedQuery: query-side (asymmetric)
  ├── embedMultimodal: text + image (shared space)
  ├── embedStale: cursor-paginated, source-grouped, rate-limit-aware
  └── Contextual-Retrieval: per-chunk context prefix before embedding
```

---

## 4. BEKANNNGE GAPS & RISIKEN (zu verifizieren)

### 4.1 Think-Pipeline Gaps

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| T1 | Intent-Klassifikation ist reine Regex | 🟡 | `inferIntent` (Zeile 189-195) nutzt einfache Keyword-Matching, kein LLM. "Was sind die rechtlichen Implikationen..." → 'general', nicht 'legal' |
| T2 | Multi-Round ohne Gap-Fill-Logik | 🟡 | Round >1 re-runt nur Gather+Synth ohne gezielte Gap-Adressierung |
| T3 | Legal-Mode nur auto-detected oder explizit | 🟡 | Auto-Detection basiert auf page types (legal_case, legal_entity, statute). Nicht-legaler Kontext mit legaler Frage → kein Legal-Mode |
| T4 | Calibration ist default OFF | 🟡 | `withCalibration` ist opt-in, nicht opt-out. Default-Bias wird nicht automatisch adressiert |

### 4.2 Legal-Engine Gaps

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| L1 | Kein RVG-Kostenrechner | 🔴 | Keine Kostenberechnung nach RVG (Rechtsanwaltsvergütungsgesetz) — essentiell für deutsche Kanzleien |
| L2 | Kein Vertrags-Klausel-Library | 🟡 | contract-draft nutzt LLM-Generierung, keine strukturierte Klausel-Bibliothek |
| L3 | memo ist NICHT quote-grounded | 🟡 | Gutachten ist generativ — keine Verbatim-Citations, nur statute references |
| L4 | summarize ist NICHT quote-grounded | 🟡 | Paraphrasing — keine Verbatim-Citations |
| L5 | Kein DSGVO-Datenauskunfts-Workflow | 🟡 | Art. 15 DSGVO: Mandant fordert Auskunft — kein automatisierter Workflow |
| L6 | Kein Lösch-Konzept (Art. 17 DSGVO) | 🟡 | Recht auf Vergessenwerden — keine automatisierte Lösch-Pipeline |
| L7 | anonymizer: detectPII ist rudimentär | 🟡 | Regex-basiert, keine NER (Named Entity Recognition). Falsch-Positive/Negative wahrscheinlich |
| L8 | Keine mehrsprachige Legal-Engine | 🟡 | DE/EN Support, aber keine IT/FR (für Südtirol/Westschweiz) |

### 4.3 Search & Retrieval Gaps

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| S1 | Query-Cache bei Multi-Tenant | 🟡 | Cache-Key beinhaltet source_id, aber knobs_hash muss korrekt isolieren |
| S2 | Reranker ist nur für tokenmax default | 🟡 | conservative/balanced haben `reranker.enabled = false` — niedrigere Search-Qualität |
| S3 | Image-Search nur Phase 2 | 🟡 | Image→Text-Knowledge (Phase 3 unified multimodal) ist noch nicht default |
| S4 | Keine Feedback-Loop | 🟡 | Kein Relevance-Feedback von Usern (Thumbs-up/down → Re-Ranking) |

### 4.4 Embedding Gaps

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| E1 | Contextual-Retrieval ist opt-in | 🟡 | Default: keine Context-Präfixe vor Embedding. Bessere Retrieval-Qualität nur bei aktivierung |
| E2 | Stale-Embedding-Detection nur NULL-check | 🟡 | Ohne provenance signature wird nur `embedding IS NULL` gecheckt, nicht Model-Wechsel |
| E3 | Kein automatischer Re-Embedding-Trigger | 🟡 | Bei Model-Wechsel muss `embed --stale` manuell getriggert werden |

### 4.5 Fristen & Compliance Gaps

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| F1 | Fristen-Monitoring nicht automatisiert | 🔴 | Deadlines werden erkannt, aber nicht aktiv überwacht (keine Cron-Checks, keine Notifications) |
| F2 | Keine Fristen-Kalender-Synchronisation | 🟡 | Kein Sync mit Google Calendar / Outlook für erkannte Fristen |
| F3 | GoBD-Verfahrensdoku ist nur Vorlage | 🟡 | Keine automatische Aktualisierung bei System-Änderungen |
| F4 | Keine DATEV-Schnittstelle | 🟡 | Kein Export nach DATEV für Buchhaltung |

### 4.6 Fehlende Kanäle

| # | Gap | Severity | Beschreibung |
|---|-----|----------|--------------|
| C1 | iCloud komplett fehlend | 🟡 | Kein Connector, keine Strategie dokumentiert |
| C2 | Mobile: Keine nativen Features | 🔴 | Push, Biometrie, Share-Extension, Scanner fehlen |
| C3 | Word-Add-In: Hardcoded URL, kein Upload | 🔴 | Nicht produktionsreif |
| C4 | Keine Outlook-Integration | 🟡 | Kein Connector für Outlook (IMAP/Graph API) |

---

## 5. TEST-COVERAGE-PRÜFUNG (Intelligence Layer)

### 5.1 Vorhandene Tests

| Bereich | Test-Datei | Coverage |
|---|---|---|
| Think-Pipeline | `server/test/think.test.ts` | ❓ Prüfen |
| Citation-Rendering | `server/test/cite-render.test.ts` | ❓ Prüfen |
| Legal-Engine | `server/test/legal-*.test.ts` | ❓ Prüfen |
| Hybrid-Search | `server/test/search/hybrid.test.ts` | ❓ Prüfen |
| Rerank | `server/test/search/rerank.test.ts` | ❓ Prüfen |
| Mode-Bundles | `server/test/search/mode.test.ts` | ❓ Prüfen |
| Embedding | `server/test/embedding.test.ts` | ❓ Prüfen |
| Stale-Embed | `server/test/embed-stale.test.ts` | ❓ Prüfen |
| Fristen | `src/lib/legal-deadlines.test.ts` | ✅ Vorhanden |
| Fristen-Erkennung | `src/lib/ai-deadline-detect.test.ts` | ✅ Vorhanden |
| GoBD | `src/lib/gobd.test.ts` | ✅ Vorhanden |
| GoBD-Verfahrensdoku | `src/lib/gobd-verfahrensdoku.test.ts` | ✅ Vorhanden |

### 5.2 Fehlende Tests

| Bereich | Status |
|---|---|
| Think Legal-Mode | ❓ |
| Think Trajectory-Integration | ❓ |
| Think Calibration-Integration | ❓ |
| Think Streaming | ❓ |
| analyze-document grounding | ❓ |
| contract-draft template-seed | ❓ |
| contract-redline playbook-deviation | ❓ |
| due-diligence checklist | ❓ |
| risk-analysis scoring | ❓ |
| memo gutachten-struktur | ❓ |
| anonymizer detectPII accuracy | ❓ |
| repository source-isolation | ❓ |
| split-statute multi-jurisdiction | ❓ |
| AI-Gateway multi-provider | ❓ |
| Search mode-switch | ❓ |
| Embedding contextual-retrieval | ❓ |
| WhatsApp legal-chat actions | ❓ |

---

## 6. DEFINITION OF DONE

Der Intelligence-Layer-Audit ist abgeschlossen, wenn beantwortet ist:

1. **Ist die Think-Pipeline production-ready für juristische Fragen?** (Citation-Grounding, Legal-Mode, Anti-Hallucination)
2. **Sind alle 12 Legal-Engine-Module production-ready?** (Vollständigkeit, Grounding, attorney-review)
3. **Ist die Search-Qualität ausreichend für juristische Recherche?** (Hybrid-Search, Rerank, Mode-Bundles)
4. **Ist die Embedding-Pipeline robust?** (Stale-Detection, Contextual-Retrieval, Multi-Provider)
5. **Sind Fristen & Compliance korrekt implementiert?** (Feiertage, Fristberechnung, GoBD)
6. **Sind die fehlenden Kanäle dokumentiert und strategisch bewertet?** (iCloud, Mobile, Word-Add-In)
7. **Ist die DACH-Rechtsraum-Abdeckung vollständig?** (DE/AT/CH/EU)
8. **Ist die Multi-Tenant-Isolation durchgängig korrekt?** (Think, Legal, Search, Embed)

---

## 7. AUSGABEFORMAT

### 7.1 Intelligence-Layer Executive Summary
- Gesamtbewertung Intelligence Layer (Production-Ready %)
- Think-Pipeline Score
- Legal-Engine Score
- Search & Retrieval Score
- Embedding Score
- Fristen & Compliance Score

### 7.2 Modul-Weise Detail-Analyse
Pro Modul:
- Status (Production-Ready / Beta / Alpha)
- Grounding-Qualität
- Test-Coverage
- Gefundene Issues
- Empfohlene Aktionen

### 7.3 Gap-Analyse (Intelligence-spezifisch)
- Fehlende Legal-Module (RVG, DSGVO-Auskunft, etc.)
- Search-Qualitäts-Lücken
- Embedding-Optimierungspotenzial
- Fehlende Kanäle (iCloud, Outlook, etc.)

### 7.4 Priorisierte Action-Items
| Priority | Item | Modul | Aufwand | Impact |
|----------|------|-------|---------|--------|
| P0 | ... | ... | S/M/L | ... |
| P1 | ... | ... | S/M/L | ... |

### 7.5 Konkurrenz-Vergleich (optional)
- Wie steht Subsumio gegenüber Legly, Lawlift, DATEV, Legaltech-Lösungen?
- Welche USP hat die Brain-Engine?
- Welche Features fehlen im Vergleich?

---

## 8. KONTEXT-DATEIEN

### Think-Pipeline
- `server/src/core/think/index.ts` — Haupt-Pipeline (862 Zeilen)
- `server/src/core/think/gather.ts` — Gather-Phase (229 Zeilen)
- `server/src/core/think/cite-render.ts` — Citation-Rendering (187 Zeilen)
- `server/src/core/think/prompt.ts` — System/User-Prompt (246 Zeilen)
- `server/src/core/think/intent.ts` — Intent-Klassifikation
- `server/src/core/think/sanitize.ts` — Sanitization
- `server/src/core/think/entity-extract.ts` — Entity-Extraction

### Legal-Engine
- `server/src/core/legal/analyze-document.ts` — Issue-Spotting (230 Zeilen)
- `server/src/core/legal/contract-draft.ts` — Vertragsentwurf (134 Zeilen)
- `server/src/core/legal/contract-redline.ts` — Redlining (297 Zeilen)
- `server/src/core/legal/document-review.ts` — Dokument-Review (196 Zeilen)
- `server/src/core/legal/due-diligence.ts` — Due Diligence (226 Zeilen)
- `server/src/core/legal/risk-analysis.ts` — Risiko-Analyse (196 Zeilen)
- `server/src/core/legal/memo.ts` — Gutachten (175 Zeilen)
- `server/src/core/legal/summarize.ts` — Zusammenfassung (160 Zeilen)
- `server/src/core/legal/anonymizer.ts` — Pseudonymisierung (393 Zeilen)
- `server/src/core/legal/repository.ts` — Repository (545 Zeilen)
- `server/src/core/legal/split-statute.ts` — Gesetzes-Parsing (311 Zeilen)
- `server/src/core/legal/llm-util.ts` — Shared Helpers
- `server/src/core/legal/types.ts` — Type-Definitions

### Search & Retrieval
- `server/src/core/search/hybrid.ts` — Hybrid-Search (1969 Zeilen)
- `server/src/core/search/rerank.ts` — Reranking (139 Zeilen)
- `server/src/core/search/mode.ts` — Mode-Bundles (1129 Zeilen)
- `server/src/core/search/by-image.ts` — Image-Search (129 Zeilen)
- `server/src/core/search/query-intent.ts` — Query-Intent
- `server/src/core/search/autocut.ts` — Autocut
- `server/src/core/search/dedup.ts` — Deduplication
- `server/src/core/search/token-budget.ts` — Token-Budget
- `server/src/core/search/two-pass.ts` — Two-Pass Expansion
- `server/src/core/search/relational-recall.ts` — Relational Recall
- `server/src/core/search/graph-signals.ts` — Graph Signals
- `server/src/core/search/query-cache.ts` — Query-Cache
- `server/src/core/search/source-boost.ts` — Source-Boost
- `server/src/core/search/recency-decay.ts` — Recency-Decay
- `server/src/core/search/expansion.ts` — Query-Expansion
- `server/src/core/search/telemetry.ts` — Telemetry

### Embedding
- `server/src/core/embedding.ts` — Haupt-Delegation (234 Zeilen)
- `server/src/core/embed-stale.ts` — Stale-Embedding Loop (239 Zeilen)
- `server/src/core/search/embedding-column.ts` — Dynamic Embedding Column
- `server/src/core/contextual-retrieval-service.ts` — Contextual Retrieval
- `server/src/core/contextual-retrieval-resolver.ts` — CR Resolver
- `server/src/core/minions/handlers/embed-backfill.ts` — Backfill Handler
- `server/src/core/minions/handlers/contextual-reindex-per-chunk.ts` — Per-Chunk Reindex

### AI-Gateway
- `server/src/core/ai/gateway.ts` — Multi-Provider Gateway (135961 bytes)
- `server/src/core/ai/types.ts` — AI Types
- `server/src/core/ai/capabilities.ts` — Model Capabilities
- `server/src/core/ai/model-resolver.ts` — Model Resolver
- `server/src/core/ai/recipes/` — Provider Recipes (18 items)
- `server/src/core/ai/build-gateway-config.ts` — Gateway Config Builder
- `server/src/core/ai/probes.ts` — Probes

### Fristen & Compliance
- `src/lib/legal-deadlines.ts` — Feiertags-Kalkulator (505 Zeilen)
- `src/lib/ai-deadline-detect.ts` — Fristen-Erkennung (208 Zeilen)
- `src/lib/gobd.ts` — GoBD-Bausteine (103 Zeilen)
- `src/lib/gobd-verfahrensdoku.ts` — Verfahrensdokumentation (141 Zeilen)

### Frontend Legal
- `src/lib/legal-types.ts` — Type-Definitions
- `src/lib/schemas/legal.ts` — Zod-Schemas
- `src/lib/legal-chat/actions.ts` — WhatsApp Legal Chat (844 Zeilen)
- `src/app/api/legal/` — 18 API-Routes

### Mobile & Word
- `capacitor.config.ts` — Mobile Config
- `mobile/README.md` — Mobile Doku
- `word-addin/src/taskpane.ts` — Word Taskpane
- `word-addin/manifest.xml` — Word Manifest

---

## 9. AUDIT-MODUS

### Phase 1: Code-Inspection
Lese jede der in §8 gelisteten Dateien und prüfe gegen die Kriterien aus §2.

### Phase 2: Pipeline-Verifikation
Trace den vollständigen Think-Flow: Question → Intent → Gather → Synthesize → Citation-Grounding → Output.
Trace den vollständigen Legal-Engine-Flow für jedes Modul.

### Phase 3: Grounding-Audit
Für jedes Modul: Kann das System eine falsche juristische Aussage als "fact" präsentieren?
Welche Guardrails existieren? Welche fehlen?

### Phase 4: Multi-Tenant-Audit
Prüfe sourceId/sourceIds/allowedSources-Durchreichung durch alle Layer.

### Phase 5: DACH-Compliance-Audit
Prüfe DE/AT/CH/EU Rechtsraum-Abdeckung: Gesetze, Fristen, Feiertage, Gerichtsentscheidungen.

### Phase 6: Gap-Analyse
Identifiziere fehlende Module (RVG, DSGVO-Auskunft, Lösch-Konzept), fehlende Kanäle (iCloud, Outlook), fehlende Tests.

### Phase 7: Final Report
Erstelle den Audit-Report im Format aus §7.

---

*Dieser Prompt fokussiert auf die Intelligence-Layer und ergänzt den ersten Audit (Ingestion-Pipeline). Zusammen decken beide Audits die gesamte Brain-Engine ab: von der Dateneingabe bis zur juristischen Superintelligenz.*
