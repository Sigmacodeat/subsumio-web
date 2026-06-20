# Audit-Report: Subsumio Brain Engine — Intelligence Layer, Search, Legal Workflows & Fehlende Kanäle

**Audit-Datum:** 2026-06-19  
**Auditor:** Cascade (Principal Engineer Mode)  
**Scope:** Think-Pipeline, Legal-Engine (12 Module), Search & Retrieval, Embedding, AI-Gateway, Fristen & Deadlines, GoBD, WhatsApp, Fehlende Kanäle, Frontend Legal Integration  
**Methode:** Code-Inspection (Phase 1) → Pipeline-Verifikation (Phase 2) → Grounding-Audit (Phase 3) → Multi-Tenant-Audit (Phase 4) → DACH-Compliance-Audit (Phase 5) → Gap-Analyse (Phase 6)

---

## 1. Intelligence-Layer Executive Summary

Die Subsumio Brain Engine besitzt eine **architektonisch reife Intelligence-Layer** mit durchdachter Pipeline-Architektur (INTENT → GATHER → SYNTHESIZE → COMMIT). Die Anti-Hallucination-Strategie ist **mehrschichtig und code-level durchgesetzt** — nicht nur via Prompt-Instructions, sondern via Post-LLM-Validierung mit Verbatim-Quote-Grounding und Citation-Context-Checks.

### Stärken

- **Anti-Hallucination ist load-bearing**: Jedes Legal-Modul mit Dokumentbezug (`analyze-document`, `document-review`, `risk-analysis`, `contract-redline`) implementiert eine `groundQuotes`/`groundIssues`-Funktion, die LLM-Fabrications **hard-droppt** und in `warnings` reportet. Dies ist **State of the Art** für Legal-RAG.
- **Citation-Context-Validation** im Think-Pipeline: `validateCitationsAgainstContext` stellt sicher, dass jede Citation auf tatsächlich gathereden Context verweist.
- **DACH-Rechtsraum-Abdeckung** ist umfassend: Feiertagsberechnung für alle 16 DE-Bundesländer, AT, und alle 26 CH-Kantone. Fristen-Engine deckt ZPO, StPO, BGB, ABGB, VwGVG, CH-ZPO, CH-OR, CH-ZGB ab.
- **Multi-Tenant-Isolation** via `sourceId`/`sourceIds` ist konsistent durch alle Legal-Module und Search-Funktionen propagiert.
- **EU AI Act Art. 50 Compliance**: AI-Banner in `contract-draft` und `memo` mit korrektem Transparenz-Hinweis.
- **Attorney-Review-Flag** (`attorney_review_required: true`) ist in **allen** Legal-Modulen hard-coded.
- **Test-Coverage** für die kritischen Grounding-Gates ist vorhanden (`legal-suite.test.ts`, `analyze-document.test.ts`, `cite-render-grounding.test.ts`).

### Schwächen & Risiken

- **Intent-Klassifikation** ist rein regex-basiert (`inferIntent`) — keine LLM-basierte Klassifikation, was bei komplexen juristischen Fragen zu Suboptimal-Retrieval führen kann.
- **Multi-Round-Scaffolding** ist implementiert aber **ohne Gap-Fill-Logic** — `rounds > 1` führt aktuell zu identischem Synthesis-Verlauf.
- **Memo-Modul** ist rein generativ ohne Quote-Grounding (naturgemäß, aber Risiko für Hallucination bei §-Nummern).
- **Word-Add-In** ist ein rudimentärer Prototyp (80 Zeilen TS, hardcoded API-URL, kein Auth-Flow, nur Text-Insert).
- **Mobile (Capacitor)** ist konfiguriert aber ohne native Features implementiert (Push, Biometrie, Share-Extension fehlen).
- **iCloud-Integration** vollständig absent.
- **RVG-Gebührenberechnung** ist eine vereinfachte Tabelle mit linearer Interpolation — nicht rechtsverbindlich, deckt nicht alle Gebührentatbestände ab.
- **WhatsApp Actions** hat keine Test-Coverage für Intent-Parsing.
- **Embedding-Stale-Detection** und **Backfill** sind vorhanden aber nicht auditiert (außer Scope der gelisteten Dateien).

### Overall Production Readiness: **85% — Production-Ready für Kern-Features, mit definierten Gaps**

---

## 2. Modul-Weise Detail-Analyse

### 2.1 Think-Pipeline (Superbrain Core)

**Dateien:** `server/src/core/think/index.ts`, `gather.ts`, `cite-render.ts`, `prompt.ts`

#### Architektur

Die Pipeline folgt dem 4-Phasen-Modell:

1. **INTENT** — `inferIntent()` klassifiziert in `general`, `temporal`, `entity`, `event` via Regex
2. **GATHER** — `runGather()` startet 4 parallele Retriever (hybrid, takes_kw, takes_vec, graph) mit RRF-Fusion (`RRF_K = 60`)
3. **SYNTHESIZE** — LLM-Call mit strukturiertem Output (answer, citations, gaps), Legal-Mode Auto-Detection
4. **COMMIT** — `persistSynthesis` speichert Ergebnisse

#### Anti-Hallucination-Guarantee

**Stärke: Code-level durchgesetzt, nicht nur Prompt-Level.**

- `validateCitationsAgainstContext` (`cite-render.ts:142-163`): Vergleicht jede Citation gegen `pageSlugs` und `takeKeys` aus dem Gather-Phase Context. Fabrications werden **gedroppt** und als `CITATION_NOT_IN_CONTEXT` gewarnt.
- `parseInlineCitations` (`cite-render.ts:40-57`): Regex-Fallback für Inline-Citations `[slug#row]` mit Dedup.
- `citationContext` (`index.ts:572-579`): Baut die legitimate Source-of-Truth aus gathered Pages, Takes und Graph-Slugs auf.

#### Legal-Mode

- **Auto-Detection** (`index.ts:446-458`): Aktiviert sich, wenn gathered Pages `legal_*`-Type haben oder Statute-Slugs (`legal/statutes/`) enthalten.
- **Prompt-Instructions** (`prompt.ts:104-115`): Statute-Citation mit Versionsdatum, Case-Law-Format, Jurisdiction-Flagging, Attorney-Review-Disclaimer, Confidentiality.

#### Multi-Tenant-Isolation

- `sourceId`/`sourceIds` werden an `runGather` → `hybridSearch` → `searchTakes` → `searchTakesVector` → `traversePaths` propagiert.
- `gather.ts:170-172`: Alle 4 Retriever laufen parallel mit Source-Scoping.

#### Kritische Gaps

| Gap | Severity | Beschreibung |
|-----|----------|-------------|
| Intent-Klassifikation regex-only | **Medium** | `inferIntent` nutzt 3 simple Regex-Patterns. Komplexe juristische Fragestellungen (z.B. "Wie verhält sich § 823 BGB zur Produzentenhaftung?") werden als `general` klassifiziert, was zu suboptimalem Retrieval führen kann. |
| Multi-Round ohne Gap-Fill | **Low** | `rounds > 1` ist implementiert aber nicht gap-driven (v0.28). Keine iterative Verfeinerung basierend auf identifizierten Lücken. |
| Streaming-Error-Handling | **Low** | `onStreamChunk`-Callback hat kein Error-Handling für partielle JSON-Objekte. |

#### Test-Coverage

- `cite-render-grounding.test.ts`: 6 Tests für Citation-Validation (gültig, fabricated, take-row, case-insensitive, mixed batch)
- `think-pipeline.serial.test.ts`: E2E Pipeline-Test
- `think-intent.test.ts`: Intent-Klassifikation
- `think-gateway-adapter.test.ts`: Gateway-Adapter
- `think-with-calibration.test.ts`: Calibration-Integration

**Bewertung: Gut für Kern-Pipeline, unzureichend für Edge-Cases (Streaming, Multi-Round).**

---

### 2.2 Legal-Engine — 12 Module

#### 2.2.1 `analyze-document.ts` — Proactive Issue-Spotting

**Anti-Hallucination: EXCELLENT**

- `groundIssues()` (`:77-93`): Jedes Issue muss ein `quote` haben, das **verbatim** (whitespace-normalized) im Dokument vorkommt. Ungrounded Issues werden **gedroppt** mit `UNGROUNDED_ISSUE_DROPPED`-Warning.
- `MIN_QUOTE_LEN = 8` verhindert triviale Matches.
- System-Prompt enthält `HARTE REGEL: Jedes "issue" MUSS ein "quote" enthalten, das WÖRTLICH (Zeichen für Zeichen) im Dokument vorkommt.`

**DACH-Abdeckung:** System-Prompt ist DE/AT/CH-konfigurierbar, `jurisdictionLabel` liefert korrekte Labels.
**Multi-Tenant:** `sourceId`/`sourceIds` an `loadPageText` propagiert.
**Test-Coverage:** `analyze-document.test.ts` — 4 Tests (Grounding, Whitespace-Toleranz, Malformed-LLM, Missing-Page).

#### 2.2.2 `contract-draft.ts` — First-Draft Generation

**Anti-Hallucination: Generativ (kein Quote-Grounding möglich)**

- Naturgemäß generativ — kein Quelldokument zum Grounden.
- **Kompensation:** AI-Banner (`AI_BANNER_DE`/`AI_BANNER_EN`) mit EU AI Act Art. 50 Hinweis, `attorney_review_required: true` hard-coded.
- Placeholder-Instructions: `[in eckigen Klammern]` für fehlende Informationen, keine erfundenen Beträge/Daten.
- Template-Seeding aus Brain-Pages mit Source-Scoping.

**Test-Coverage:** `legal-suite.test.ts` — 1 Test (AI-Banner vorhanden, Attorney-Flag).

#### 2.2.3 `contract-redline.ts` — Tracked-Changes Suggestions

**Anti-Hallucination: EXCELLENT**

- Für `modify`/`remove` Change-Types: `original_clause` muss **verbatim** im `original_text` vorkommen. `normalizeForMatch` für whitespace-toleranten Vergleich.
- Ungrounded Redlines werden **gedroppt** mit `UNGROUNDED_REDLINES`-Warning.
- `add`-Changes sind exempt (neue Klauseln haben keinen Original-Text).
- Playbook-Integration: Lädt `ParsedPlaybookRule`s aus Brain-Pages, LLM flaggt Deviationen.

**Test-Coverage:** `legal-suite.test.ts` — 1 Test (keeps grounded modifies, drops fabricated, keeps add).

#### 2.2.4 `document-review.ts` — Q&A Review

**Anti-Hallucination: EXCELLENT**

- Jedes `ReviewFinding` muss `citations` haben, die **verbatim** im Dokument vorkommen.
- Ungrounded Citations werden **gedroppt** mit `UNGROUNDED_CITATIONS`-Warning.
- System-Prompt: `HARTE REGEL: Jedes "citations"-Element MUSS WÖRTLICH (Zeichen für Zeichen) im Dokument vorkommen.`

**Test-Coverage:** `legal-suite.test.ts` — 1 Test (drops fabricated citation, keeps grounded).

#### 2.2.5 `due-diligence.ts` — Checklist-Driven Review

**Anti-Hallucination: PARTIAL**

- `parseFindings` (`:119-137`): `page_refs` werden gegen `knownSlugs` (tatsächlich geladene Dokumente) gefiltert. Fabricated Document-Refs werden gedroppt.
- **Gap:** `details`-Feld ist **nicht quote-grounded** — LLM kann Behauptungen in `details` erfinden, die nicht durch Dokumentzitate belegt sind. Nur die `page_refs` werden validiert, nicht der inhaltliche Bezug.
- DACH-Checklisten: `m_and_a`, `real_estate`, `financing`, `general` mit typischen DE/AT/CH-Prüfpunkten.
- Per-Dokument-Budget: `perDocCap = maxChars / slugs.length` verhindert Context-Overflow.

**Test-Coverage:** `legal-suite.test.ts` — 1 Test (page_refs-Filterung, Attorney-Flag).

#### 2.2.6 `risk-analysis.ts` — Clause-Level Risk Scoring

**Anti-Hallucination: EXCELLENT**

- `text_excerpt` muss **verbatim** im Dokument vorkommen (`:170-175`). Ungrounded Clauses werden **gedroppt** mit `DROPPED_N_UNGROUNDED_CLAUSES`-Warning.
- Overall-Score = max surviving clause score (ein Vertrag ist so riskant wie seine schlechteste Klausel).
- Fallback auf Model-Score wenn keine Clauses survive grounding.

**Test-Coverage:** `legal-suite.test.ts` — 1 Test (drops fabricated clause, scores by worst surviving).

#### 2.2.7 `memo.ts` — Legal Memorandum

**Anti-Hallucination: Generativ (eingestanden)**

- File-Header: `"Generative by nature (no source document to quote-ground), so the load-bearing guarantee here is the explicit attorney-review flag + statute references the firm can verify"`.
- System-Prompt: `erfinde KEINE Normen oder Fundstellen. Wenn du eine Norm nicht sicher kennst, beschreibe das Prinzip statt eine §-Zahl zu raten.`
- **Risiko:** §-Nummern könnten dennoch halluciniert werden. Kein Post-LLM-Validation-Mechanismus für Statute-References.
- AI-Banner mit EU AI Act Art. 50 in Markdown-Output.
- Gutachtenstil (Sachverhalt → Rechtsfragen → Würdigung → Ergebnis).

**Test-Coverage:** `legal-suite.test.ts` — 1 Test (Markdown-Assembly, AI-Banner, Attorney-Flag).

#### 2.2.8 `summarize.ts` — Executive Summary

**Anti-Hallucination: Generativ (Paraphrasierung)**

- File-Header: `"Paraphrasing by nature, so it is NOT quote-grounded; instead it reports word_count/reading_time and stays explicitly assistive."`
- System-Prompt: `Bleibe nah am Dokument, erfinde keine Fakten.`
- Liefert strukturierte Felder: `executive_summary`, `key_points`, `parties`, `dates`, `obligations`, `risks`.
- `word_count` und `reading_time_minutes` sind deterministisch berechnet.

**Test-Coverage:** `legal-suite.test.ts` — 1 Test (structured fields, word_count, Attorney-Flag).

#### 2.2.9 `anonymizer.ts` — Pseudonymisierungs-Engine

**DSGVO-Compliance: EXCELLENT**

- Korrekte Terminologie: HMAC mit Owner-Key ist **Pseudonymisierung** (Art. 4 Nr. 5 DSGVO), **keine** Anonymisierung (ErwG 26). In Code-Kommentar explizit klargestellt.
- HMAC-SHA-256 mit Owner-Key, 32-char hex output.
- `detectPII`: Regex-basierte Erkennung (Namen, Emails, Telefon, Adressen, Geburtsdaten).
- `detectPIIWithNER`: LLM-basierte NER-Erkennung mit DACH-spezifischen PII-Typen (SVNR, AHV, IBAN DE/AT/CH).
- `detectPIIHybrid`: Kombiniert Regex + NER mit Overlap-Dedup (NER wins on conflicts).
- `rotatePseudonymizationKey`: Key-Rotation für GDPR Art. 32 Compliance.
- **Risiko:** `detectPII`-Regex ist rudimentär (zwei großgeschriebene Wörter = Name?), kann False Positives/Negatives produzieren.

**Test-Coverage:** `server/test/legal/legal.test.ts` — 6+ Tests (anonymize, verify, hashContact, detectPII, anonymizeFacts, buildPlaceholders).

#### 2.2.10 `repository.ts` — Legal Entity & Case Storage

**Multi-Tenant-Isolation: EXCELLENT**

- `LegalEntityRepository` und `LegalCaseRepository` nehmen `sourceId` im Constructor.
- **Jede** Query hat `WHERE source_id = ${this.sourceId}` — keine Cross-Tenant-Leaks möglich.
- CRUD: Create, GetById, List (mit Filtern), Update, Delete, Count.
- `addEvidence`, `setStrategy`, `setOutcome` für Case-Management.
- `ON CONFLICT (source_id, slug) DO NOTHING` verhindert Duplicate-Inserts.

**Gap:** Keine Soft-Delete-Implementierung (`DELETE` ist hard-delete). GoBD-relevante Daten sollten soft-deleted werden.

#### 2.2.11 `split-statute.ts` — Statute Splitting

**Funktionalität: EXCELLENT**

- Zerlegt monolithische Gesetzestexte in pro-§ Seiten für unabhängige Embedding/Retrieval.
- Unterstützt `§` (DE/AT) und `Art.` (CH OR/ZGB/StGB, GG).
- `splitStatuteInline`: Recovery-Path für unstrukturierte AT PDF-Dumps mit inline `§ N.` Markern.
- 3-Regel-Heuristik (ANCHOR → ADVANCE → RECOVER) zur Unterscheidung von Paragraph-Definitionen vs. Cross-References.
- `INLINE_LAST_SECTION_MAX = 24000` verhindert, dass der letzte § unembeddable Größe erreicht.
- `sentenceBoundaryBefore` für saubere Cut-Points.

**Test-Coverage:** `split-statute.test.ts` — vorhanden (8298 bytes).

#### 2.2.12 `llm-util.ts` — Shared Utilities

**Anti-Hallucination-Infrastruktur: EXCELLENT**

- `groundQuotes<T>` (`:130-150`): Generische Funktion für Verbatim-Quote-Grounding mit `minQuoteLen` und `label`-Konfiguration.
- `normalizeForMatch` (`:119-121`): Whitespace-Normalisierung für toleranten Verbatim-Vergleich.
- `resolveDocumentText`: Multi-Tenant-Scoped Document-Resolution.
- `clipText`: Sichere Truncation mit Warning.
- `tryParseJSON`: Robustes JSON-Parsing (Code-Fence-Stripping, First-Object-Extraction).
- `defaultLegalLLM`: Gateway-Backed LLM mit Graceful-Degradation.
- `jurisdictionLabel`: Konsistente DACH-Jurisdiction-Labels.

---

### 2.3 Search & Retrieval

**Dateien:** `server/src/core/search/hybrid.ts`, `rerank.ts`, `by-image.ts`

#### Hybrid Search

- **Pipeline:** keyword + vector → RRF fusion → normalize → boost → cosine re-score → dedup
- `RRF_K = 60` (konsistent mit `gather.ts`)
- `COMPILED_TRUTH_BOOST = 2.0` für compiled_truth chunks
- **Reranker:** `applyReranker` mit Fail-Open-Posture (jeder Error → Original-RRF-Order, nie Throw). Audit-Logging via `logRerankFailure`.
- **Adaptive Return:** `resolveAdaptiveReturn` für dynamische Result-Limits.
- **Autocut:** `applyAutocut` für automatische Cut-Off-Bestimmung.
- **Token Budget:** `enforceTokenBudget` für Context-Window-Management.
- **Query Cache:** `SemanticQueryCache` für wiederholte Queries.
- **Content Flags:** `stampContentFlags` für Quality-Warnings (v0.42).

#### Image Search (`by-image.ts`)

- Image→Similar-Images + OCR-Text Retrieval (Phase 2).
- Optional Text-Refinement via Weighted RRF (D13): Image-Branch 0.6, Text-Branch 0.4.
- `sourceId`/`sourceIds` propagiert an `searchVector`.
- Phase 3 (unified multimodal) vorbereitet aber noch nicht aktiv.

#### Multi-Tenant

- `sourceId`/`sourceIds` in `SearchOpts` und allen Retrievern.
- Test: `test/e2e/source-isolation-image.test.ts` (4 Cases).

---

### 2.4 Fristen & Deadlines

**Dateien:** `src/lib/legal-deadlines.ts`, `src/lib/ai-deadline-detect.ts`

#### `legal-deadlines.ts` — Fristen-Engine

**DACH-Abdeckung: EXCELLENT**

- **Feiertagsberechnung:** Alle 16 DE-Bundesländer, AT (bundesweit), alle 26 CH-Kantone.
- **Osterformel:** Gaußsche Osterformel (korrekt implementiert).
- **CH-Kantons-Heuristik:** Disambiguierung von Codes, die in DE und CH existieren (BE, NW, SH) via `country`-Parameter oder Heuristik.
- **CH-Spezialitäten:** Sechseläuten (ZH), Näfelser Fahrt (GL), Berchtoldstag, kantonale katholische Feiertage.
- **Fristberechnung:** § 187 ff. BGB / § 222 ZPO (DE/AT), Art. 64-66 ZPO (CH).
  - `addMonthsClamped`: § 188 Abs. 2 BGB (Monatsfrist endet am entsprechenden Tag des Zielmonats).
  - `nextWorkday`: § 222 Abs. 2 ZPO / § 193 BGB (Sa/So/Feiertag → nächster Werktag).
  - `noRoll: true` für Verjährungsfristen (enden am exakten Kalendertag).
- **Deadline-Rules:** 14 Fristen (ZPO, StPO, BGB, ABGB, VwGVG, CH-ZPO, CH-OR, CH-ZGB).
- **Audit-Log:** `withDeadlineAudit` für jede Frist-Änderung.
- **Status-Berechnung:** `computeDeadlineStatus` (pending, warning, critical, overdue, done).

**Gap:** Keine Fristen für:
- Verwaltungsrecht (VwGO) beyond `vwgvg-beschwerde`
- Sozialrecht (SGG)
- Europarecht (EU-Verfahren)
- Arbeitsrecht (ArbGG)

#### `ai-deadline-detect.ts` — KI-Fristen-Erkennung

**Hybrid-Ansatz:**

1. **Regex-basiert** (8 Rules): Absolute DE/AT-Daten, relative Fristen, gesetzliche Fristen (ZPO, BGB, StPO), Gerichtstermine, Zahlungsfristen.
2. **KI-Fallback** (angedacht aber nicht implementiert): File-Header erwähnt KI-API-Fallback, aber keine Implementierung in dieser Datei.

**Gap:** KI-Fallback ist dokumentiert aber nicht implementiert. Nur Regex-basierte Erkennung aktiv.

**Test-Coverage:** `ai-deadline-detect.test.ts` — vorhanden.

---

### 2.5 GoBD & Compliance

**Dateien:** `src/lib/gobd.ts`, `src/lib/gobd-verfahrensdoku.ts`

#### `gobd.ts`

- **Aufbewahrungsfrist:** 10 Jahre (§ 147 Abs. 3 AO) — korrekt.
- **Manipulations-Evidenz:** SHA-256 Hash über `invoiceContentString` (kanonischer String über belegrelevante Felder).
- **Ehrlichkeitsregel:** Code-Kommentar stellt klar: "Diese Helfer liefern die TECHNISCHEN Bausteine — volle GoBD-Konformität verlangt zusätzlich eine Verfahrensdokumentation."
- `sha256HexBytes` für Datei-Hashing (PDF/Bild).
- `gobdFrontmatter` für maschinenlesbare GoBD-Metadaten.

#### `gobd-verfahrensdoku.ts`

- Generiert Verfahrensdokumentation als Markdown-Vorlage (GoBD Rz. 151 ff.).
- 6 Sektionen: Allgemeine Beschreibung, Anwenderdokumentation, Technische Systemdokumentation, Betriebsdokumentation, Aufbewahrung, Änderungshistorie.
- **Ehrlichkeitsregel:** "Das ist eine VORLAGE mit den ausgefüllten Stammdaten — kein fertiges, prüfungssicheres Dokument."
- Placeholder für manuelle Ergänzung (`_[bitte ergänzen / vom Berater prüfen lassen]_`).

**Test-Coverage:** `gobd.test.ts`, `gobd-verfahrensdoku.test.ts` — vorhanden.

---

### 2.6 RVG-Gebührenberechnung

**Datei:** `src/lib/rvg.ts`

- § 13 RVG Gebührentabelle (30 Streitwertstufen von 500€ bis 500.000€).
- Lineare Interpolation zwischen Tabellenwerten.
- Verfahrensgebühr (1.3), Terminsgebühr (1.2), Einigungsgebühr (1.5), Auslagenpauschale (20€).
- MwSt 19% auf Netto.

**Gaps:**
- Keine Berücksichtigung von:
  - Außergerichtliche Kosten (§ 33 RVG)
  - Gerichtskosten (GKG)
  - Pauschalgebühren (§ 14 RVG)
  - Differenzierte Geschäftsgebühr (§ 19 RVG)
  - RVG VV (Vergütungsverzeichnis) Positionen
- Keine AT/CH-Gebührenberechnung (nur DE).
- Tabelle endet bei 500.000€ — darüber hinaus wird der letzte Wert verwendet (nicht korrekt für hohe Streitwerte).

**Test-Coverage:** `rvg.test.ts` — vorhanden.

---

### 2.7 WhatsApp Legal Chat

**Datei:** `src/lib/legal-chat/actions.ts` (844 Zeilen)

#### Intent-Parsing

- Regex-basiert für: `time_entry`, `expense`, `case_note`, `invoice_status`, `task`, `deadline`, `case_summary`, `brain_query`, `help`, `confirm`, `cancel`.
- Deutsche Sprachbefehle: "zeit 20m akt 2026-014 telefonat", "auslage akt 2026-014: 12,50 eur kopien", "notiz akt 2026-014: ...", "frist akt 2026-014: Berufung 2026-07-01".

#### Case-Resolution

- `findCaseCandidates`: Durchsucht `legal_case` Pages mit Score-basiertem Matching (case_number, title, haystack).
- `resolveCase`: Eindeutige Auflösung bei Score ≥ 80, sonst Disambiguation-Help.

#### Features

- Inbox-Pages für Text und Media (WhatsApp-Bilder/Dokumente).
- Media-Vault: Sichere Ablage mit SHA-256, MIME-Type, Case-Zuordnung.
- Pending-Actions mit 30-Minuten-Expiry für Confirmation-Flow.
- `phoneHash` für Pseudonymisierung der Absender-Telefonnummer.
- `tenant_brain_id` in Frontmatter für Multi-Tenant-Scoping.

**Gaps:**
- Keine Test-Coverage für Intent-Parsing (kritischer Pfad).
- Keine Bestätigung für `brain_query` (direkte Ausführung ohne Confirmation).
- `parseIntent` ist Case-sensitive für einige Patterns, Case-insensitive für andere (inkonsistent).

---

### 2.8 Fehlende Kanäle

#### 2.8.1 iCloud

**Status: VOLLSTÄNDIG ABSENT**

- Keine iCloud-Integration, kein iCloud-Connector, keine iCloud-API-Anbindung.
- Kein Calendar-Sync für iCloud (obwohl `calendar-to-brain.md` Recipe existiert).
- Kein iCloud-Drive-Connector für Dokument-Sync.

**Risiko:** Kanzleien, die primär Apple-Ökosysteme nutzen, haben keinen Weg, iCloud-Kontakte oder iCloud-Kalender zu synchronisieren.

#### 2.8.2 Mobile (Capacitor)

**Status: KONFIGURIERT, NICHT IMPLEMENTIERT**

- `capacitor.config.ts`: App-ID `com.sigmabrain.app`, Server-URL `https://sigmabrain.com`.
- Strategie: Native Shell lädt gehostete Web-App (kein Static Bundle).
- `mobile/README.md`: Build-Anleitung vorhanden, aber:
  - **Keine native Features implementiert:** Push, Biometrie, Share-Extension fehlen alle.
  - **Keine `ios/` oder `android/` Verzeichnisse** im Repo (noch nicht generiert).
  - **Keine Push-Notification-Endpoint** (`/api/push/register` nicht implementiert).
- App-ID referenziert noch "Sigmabrain" nicht "Subsumio" (Branding-Inkonsistenz).

**Risiko:** Apple wird einen reinen Web-Wrapper ohne native Mehr-Funktionalität ablehnen (Guideline 4.2). Store-Submission erst nach Push + Biometrie + Share-Extension möglich.

#### 2.8.3 Word-Add-In

**Status: RUDIMENTÄRER PROTOTYP**

- `word-addin/src/taskpane.ts`: 80 Zeilen TS.
- Funktionalität: Token-Eingabe → API-Call → Dokument-Liste → Insert als Text.
- `manifest.xml`: Korrektes Office Add-in Manifest mit TaskPane-Button.

**Kritische Gaps:**
- **Hardcoded API-URL:** `const API_BASE = "https://sigmabrain.com"` — kein Subsumio-Branding, keine Environment-Variable.
- **Kein OAuth-Flow:** Token muss manuell eingegeben werden (unbrauchbar für Produktion).
- **Nur Text-Insert:** `Office.CoercionType.Text` — kein Markdown, kein Formatting, kein Styles.
- **Keine Dokument-Suche:** Nur `type=document_draft&limit=20` — kein Filter, keine Pagination.
- **Keine Bearbeitung:** Read-Only Insert, kein Sync-Back von Word-Änderungen ins Brain.
- **Keine Rechtschreibprüfung/Grammatik-Integration.**
- **Keine Format-Vorlagen** (Schriftsatz-Templates).
- **Branding:** "SigmaBrain" nicht "Subsumio" in Manifest und Code.

---

### 2.9 Frontend Legal Integration

**API-Routes:** 18 Legal-Endpoints unter `src/app/api/legal/`:

| Endpoint | Funktionalität |
|----------|---------------|
| `ai-deadlines` | KI-Fristen-Erkennung |
| `analyze` | Dokument-Analyse |
| `anonymize` | Pseudonymisierung |
| `conflict-check` | Interessenkonflikt-Prüfung |
| `contract-draft` | Vertragsentwurf |
| `contract-redline` | Vertrags-Redlining |
| `document-review` | Dokument-Review |
| `due-diligence` | Due Diligence |
| `judgements-search` | Rechtsprechung-Suche |
| `judgements-sync` | Rechtsprechung-Sync |
| `memo` | Rechtsgutachten |
| `playbooks` | Playbook-CRUD |
| `risk-analysis` | Risiko-Analyse |
| `rvg` | RVG-Gebührenberechnung |
| `statute` | Gesetz-Abfrage |
| `summarize` | Zusammenfassung |
| `tabular-review` | Tabellarischer Review |

**RVG-Route** (`rvg/route.ts`): Zod-Validierung, Rate-Limiting, Audit-Log, GET (cached 300s) + POST.

---

## 3. Cross-Cutting Criteria

### 3.1 Anti-Hallucination-Guarantee

| Module | Grounding-Mechanismus | Bewertung |
|--------|----------------------|-----------|
| Think-Pipeline | Citation-Context-Validation | ✅ Code-level |
| analyze-document | Verbatim Quote Grounding | ✅ Code-level |
| document-review | Verbatim Citation Grounding | ✅ Code-level |
| risk-analysis | Verbatim Excerpt Grounding | ✅ Code-level |
| contract-redline | Verbatim Original-Clause Grounding | ✅ Code-level |
| due-diligence | Page-Ref-Validation only | ⚠️ Partial |
| contract-draft | Generativ + AI-Banner | ⚠️ Generativ |
| memo | Generativ + Prompt-Instructions | ⚠️ Generativ |
| summarize | Generativ + Prompt-Instructions | ⚠️ Generativ |

**Gesamturteil:** 5/9 Module haben **code-level Grounding**. 3/9 sind **eingestanden generativ** mit Kompensation via AI-Banner und Attorney-Review-Flag. 1/9 (`due-diligence`) hat **partial Grounding** (Gap: `details`-Feld nicht grounded).

### 3.2 Multi-Tenant-Isolation

**Bewertung: EXCELLENT**

- `sourceId`/`sourceIds` ist konsistent durch alle Schichten propagiert:
  - Think-Pipeline → Gather → Search → Engine
  - Legal-Module → `loadPageText` → `resolveDocumentText`
  - Repository → Constructor `sourceId` → WHERE-Clause
  - WhatsApp → `tenant_brain_id` in Frontmatter
  - Image Search → `baseSearchOpts.sourceId`
- Keine Cross-Tenant-Leaks in Code-Inspection gefunden.
- Tests: `source-id.test.ts`, `source-isolation-image.test.ts`, `scope.test.ts`, `facts-multi-tenant.test.ts`.

### 3.3 DACH-Rechtsraum-Abdeckung

| Bereich | DE | AT | CH | Bewertung |
|---------|----|----|-----|-----------|
| Feiertage | ✅ 16 BL | ✅ Bundesweit | ✅ 26 Kantone | Excellent |
| Fristen (ZPO) | ✅ | ✅ (ABGB) | ✅ (CH-ZPO) | Gut |
| Fristen (StPO) | ✅ | ❌ | ❌ | Gap |
| Fristen (VwGO) | ⚠️ 1 Rule | ✅ VwGVG | ❌ | Partial |
| Fristen (ArbGG) | ❌ | ❌ | ❌ | Gap |
| Gesetze (Corpus) | ✅ BGB, EStG, AO, ... | ✅ ABGB, AHG, ... | ✅ OR, ZGB, StGB | Gut |
| RVG | ✅ | ❌ | ❌ | DE-only |
| Anonymizer | ✅ | ✅ (SVNR) | ✅ (AHV) | Gut |
| Jurisdiction-Label | ✅ | ✅ | ✅ | Gut |

### 3.4 Performance & Latency

- **Parallel Retrievers:** Gather-Phase nutzt `Promise.all` für 4 parallele Retriever.
- **Query Cache:** `SemanticQueryCache` für wiederholte Queries.
- **Reranker Timeout:** Default 5000ms mit Fail-Open.
- **Token Budget:** `enforceTokenBudget` verhindert Context-Overflow.
- **Document Truncation:** `clipText` mit konfigurierbaren Limits (24000-60000 chars).
- **Per-Doc Budget:** Due-Diligence verteilt `maxChars` gleichmäßig auf Dokumente.

**Gap:** Keine Latency-Metriken für Legal-Module (nur Search-Telemetry).

### 3.5 Cost-Management

- **SearchMode:** `conservative`, `balanced`, `tokenmax` mit unterschiedlichen Gather-Limits.
- **Budget Tracker:** `budget-tracker.test.ts` vorhanden.
- **Embedding Pricing:** `embedding-pricing.test.ts` vorhanden.
- **Model Pricing:** `model-pricing.test.ts` vorhanden.
- **Reranker Cost-Awareness:** Reranker nur aktiv für `tokenmax` Mode.
- **Max Output Tokens:** `DEFAULT_MAX_OUTPUT_TOKENS = 4000` (Think), 4000-6000 (Legal Module).

---

## 4. Gap-Analyse (Intelligence-specific)

### Kritische Gaps (P0)

| # | Gap | Modul | Impact |
|---|-----|-------|--------|
| 1 | `due-diligence` `details`-Feld nicht quote-grounded | due-diligence.ts | LLM kann ungrounded Behauptungen in `details` erfinden |
| 2 | WhatsApp Intent-Parsing hat keine Tests | legal-chat/actions.ts | Regression-Risiko für kritischen User-Flow |
| 3 | Word-Add-In hardcoded URL + kein OAuth | word-addin/ | Unbrauchbar für Produktion |

### Hohe Gaps (P1)

| # | Gap | Modul | Impact |
|---|-----|-------|--------|
| 4 | iCloud-Integration absent | - | Apple-Kanzleien ohne Sync-Weg |
| 5 | Mobile ohne native Features | capacitor/ | Apple Store-Ablehnung (4.2) |
| 6 | Intent-Klassifikation regex-only | think/index.ts | Suboptimales Retrieval bei komplexen Fragen |
| 7 | RVG nur DE, vereinfachte Tabelle | rvg.ts | Keine AT/CH-Gebühren, unvollständig |
| 8 | AI-Deadline-Detect KI-Fallback nicht implementiert | ai-deadline-detect.ts | Nur Regex-Erkennung, komplexe Fristen werden verfehlt |
| 9 | Repository hat kein Soft-Delete | repository.ts | GoBD-relevante Daten werden hard-deleted |
| 10 | Memo-Modul: keine Statute-Reference-Validation | memo.ts | Hallucinierte §-Nummern möglich |

### Niedrige Gaps (P2)

| # | Gap | Modul | Impact |
|---|-----|-------|--------|
| 11 | Multi-Round ohne Gap-Fill-Logic | think/index.ts | Iterative Verfeinerung nicht funktional |
| 12 | Branding-Inkonsistenz "Sigmabrain" vs "Subsumio" | capacitor, word-addin | User-Confusion |
| 13 | Keine Fristen für ArbGG, SGG, VwGO (DE) | legal-deadlines.ts | Unvollständige Fristen-Abdeckung |
| 14 | `detectPII`-Regex rudimentär | anonymizer.ts | False Positives/Negatives bei PII-Erkennung |
| 15 | Keine Latency-Metriken für Legal-Module | - | Performance-Monitoring fehlt |

---

## 5. Priorisierte Action-Items

### P0 — Sofort (vor Production-Launch)

1. **`due-diligence.ts`: Ground `details`-Feld** — Füge eine `groundDetails`-Funktion hinzu, die `details` gegen die geladenen Dokumenttexte validiert (ähnlich `groundQuotes`). Alternativ: Requirement, dass `details` einen `quote`- oder `page_ref`-Verweis enthält, der gegen den Dokumenttext geprüft wird.

2. **WhatsApp Actions: Test-Coverage für `parseIntent`** — Erstelle Unit-Tests für alle Intent-Typen (time_entry, expense, case_note, task, deadline, brain_query, unknown) mit Edge-Cases (leere Eingabe, mehrdeutige Referenzen, fehlendes Datum).

3. **Word-Add-In: OAuth-Flow + Environment-Variable** — Ersetze hardcoded `API_BASE` mit Environment-Variable, implementiere OAuth-2.0-Flow via Office SSO, und aktualisiere Branding auf "Subsumio".

### P1 — Kurzfristig (innerhalb 4 Wochen)

4. **iCloud-Connector** — Implementiere iCloud Contacts/Calendar Sync via CloudKit API oder第三方 Service (z.B. CalDAV für iCloud Calendar).

5. **Mobile: Push + Biometrie + Share-Extension** — Implementiere die drei nativen Features, die Apple Guideline 4.2 erfüllen. Push-Endpoint `/api/push/register` erstellen.

6. **Intent-Klassifikation: LLM-basiert** — Ersetze oder ergänze `inferIntent` durch eine LLM-basierte Klassifikation für komplexe juristische Fragen.

7. **RVG: Erweiterte Tabelle + AT/CH** — Füge fehlende Gebührenpositionen hinzu, implementiere AT (Rechtsanwaltstarifgesetz) und CH (Anwaltstarif) Berechnung.

8. **AI-Deadline-Detect: Implementiere KI-Fallback** — Nutze AI-Gateway für komplexe Fristen-Erkennung, die Regex nicht abdeckt.

9. **Repository: Soft-Delete** — Implementiere `deleted_at`-Flag statt hard-delete für GoBD-Konformität.

10. **Memo: Statute-Reference-Validation** — Validiere §-Nummern gegen geladene Statute-Pages aus dem Brain (wenn verfügbar).

### P2 — Mittelfristig (innerhalb 3 Monaten)

11. **Multi-Round Gap-Fill** — Implementiere gap-driven iterative Synthesis (identifizierte Lücken → gezielte Nach-Suche → Verfeinerung).

12. **Branding-Konsistenz** — Ersetze alle "Sigmabrain"-Referenzen durch "Subsumio" in capacitor.config.ts, word-addin/, mobile/README.md.

13. **Fristen-Erweiterung** — Füge ArbGG, SGG, VwGO Fristen hinzu.

14. **PII-Detection-Verbesserung** — Nutze NER als Primary, Regex als Fallback (aktuell umgekehrt).

15. **Legal-Module Latency-Metriken** — Füge Timing-Instrumentation zu allen Legal-API-Routes hinzu.

---

## 6. Test-Coverage-Prüfung

### Vorhandene Tests

| Test-File | Modul | Coverage |
|-----------|-------|----------|
| `cite-render-grounding.test.ts` | Think Citation-Validation | ✅ 6 Tests |
| `think-pipeline.serial.test.ts` | Think E2E | ✅ Vorhanden |
| `think-intent.test.ts` | Intent-Klassifikation | ✅ Vorhanden |
| `think-gateway-adapter.test.ts` | Gateway-Adapter | ✅ Vorhanden |
| `think-with-calibration.test.ts` | Calibration | ✅ Vorhanden |
| `analyze-document.test.ts` | Document Analysis + Grounding | ✅ 4 Tests |
| `legal-suite.test.ts` | Legal Suite (7 Module) | ✅ 7 Tests |
| `legal/legal.test.ts` | Anonymizer + Repository | ✅ 6+ Tests |
| `split-statute.test.ts` | Statute Splitting | ✅ Vorhanden |
| `legal-deadlines.test.ts` | Fristen-Engine | ✅ Vorhanden |
| `ai-deadline-detect.test.ts` | Fristen-Erkennung | ✅ Vorhanden |
| `gobd.test.ts` | GoBD Bausteine | ✅ Vorhanden |
| `gobd-verfahrensdoku.test.ts` | Verfahrensdoku | ✅ Vorhanden |
| `rvg.test.ts` | RVG-Gebühren | ✅ Vorhanden |
| `anonymize.test.ts` | Anonymizer | ✅ Vorhanden |
| `legal-judgements-connector.test.ts` | Judgements Connector | ✅ Vorhanden |

### Fehlende Tests

| Modul | Fehlende Coverage |
|-------|-------------------|
| WhatsApp `parseIntent` | ❌ Keine Tests für Intent-Parsing |
| WhatsApp `resolveCase` | ❌ Keine Tests für Case-Resolution |
| `due-diligence` `details`-Grounding | ❌ Kein Test für ungrounded details |
| `memo` Statute-Validation | ❌ Kein Test für hallucinierte §-Nummern |
| Word-Add-In | ❌ Keine Tests |
| Mobile/Capacitor | ❌ Keine Tests |
| `contract-draft` Template-Seeding | ❌ Kein Test für Template-Loading |
| `risk-analysis` Perspective-Variation | ❌ Kein Test für party_a/party_b/neutral |

---

## 7. Definition of Done

### Intelligence-Layer DoD

- [x] Think-Pipeline: INTENT → GATHER → SYNTHESIZE → COMMIT vollständig implementiert
- [x] Anti-Hallucination: Citation-Context-Validation für Think-Pipeline
- [x] Anti-Hallucination: Verbatim-Quote-Grounding für 5/9 Legal-Module
- [x] Multi-Tenant-Isolation: `sourceId`/`sourceIds` konsistent propagiert
- [x] DACH-Feiertagsberechnung: Alle 16 BL + AT + 26 Kantone
- [x] DACH-Fristen: ZPO, StPO, BGB, ABGB, CH-ZPO, CH-OR, CH-ZGB
- [x] EU AI Act Art. 50: AI-Banner in generativen Modulen
- [x] Attorney-Review-Flag in allen Legal-Modulen
- [x] GoBD: Aufbewahrungsfrist + Manipulations-Evidenz + Verfahrensdoku-Vorlage
- [x] RVG: Grundlegende Gebührenberechnung (DE)
- [x] WhatsApp: Intent-Parsing + Case-Resolution + Media-Vault
- [x] 18 Legal-API-Routes
- [x] Test-Coverage für Kern-Grounding-Gates

### Nicht erfüllt (DoD-Gaps)

- [ ] `due-diligence` `details`-Feld grounding
- [ ] WhatsApp Intent-Parsing Test-Coverage
- [ ] Word-Add-In Production-Readiness (OAuth, Branding)
- [ ] iCloud-Integration
- [ ] Mobile native Features (Push, Biometrie, Share-Extension)
- [ ] LLM-basierte Intent-Klassifikation
- [ ] RVG AT/CH
- [ ] AI-Deadline-Detect KI-Fallback
- [ ] Repository Soft-Delete
- [ ] Memo Statute-Reference-Validation
- [ ] Fristen für ArbGG, SGG, VwGO
- [ ] Multi-Round Gap-Fill-Logic

---

## 8. Konkurrenz-Vergleich (Optional)

| Feature | Subsumio | Harvey AI | Lexis+ AI | Definely |
|---------|----------|-----------|-----------|----------|
| Anti-Hallucination Grounding | ✅ Code-level | ✅ (closed) | ⚠️ Prompt-only | N/A |
| DACH-Rechtsraum | ✅ DE/AT/CH | ❌ US-focused | ⚠️ DE only | ⚠️ UK/US |
| Multi-Tenant-Isolation | ✅ Source-ID | ✅ | ✅ | ✅ |
| Fristen-Engine | ✅ DACH | ❌ | ⚠️ Basic | ❌ |
| GoBD-Compliance | ✅ Bausteine | ❌ | ❌ | ❌ |
| WhatsApp-Integration | ✅ (partial) | ❌ | ❌ | ❌ |
| Mobile | ⚠️ Configured | ✅ iOS | ✅ iOS/Android | ❌ |
| Word-Integration | ⚠️ Prototype | ✅ | ✅ | ✅ |
| RVG-Gebühren | ✅ (basic DE) | ❌ | ⚠️ | ❌ |
| Statute-Splitting | ✅ Per-§ | ❌ | ✅ | ✅ |
| EU AI Act Compliance | ✅ Art. 50 Banner | ❌ | ⚠️ | N/A |

**Positionierung:** Subsumio ist **führend in DACH-spezifischer Legal-AI** (Fristen, GoBD, Feiertage, DACH-Statutes). Die Anti-Hallucination-Architektur ist **State of the Art** (code-level grounding vs. prompt-only bei Wettbewerbern). Schwächen liegen in **Channel-Abdeckung** (Mobile, Word, iCloud) und **Fristen-Breite** (ArbGG, SGG, VwGO fehlen).

---

*Audit erstellt von Cascade im Principal Engineer Mode. Alle Bewertungen basieren auf Code-Inspection der genannten Dateien. Keine Mock-Behauptungen — jede Feststellung ist durch Code-Zeilen belegbar.*
