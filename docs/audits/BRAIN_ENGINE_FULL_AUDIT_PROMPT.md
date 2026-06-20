# Vollständiger Audit-Prompt: Subsumio Brain Engine — Daten-Ingestion, Verarbeitung & Superbrain-Integration

> **Zweck:** Dieser Prompt prüft die gesamte Brain-Engine-Pipeline einer Kanzlei-Software — vom Empfang externer Daten (PDF, Bilder, DOCX, E-Mails, Google, iCloud, lokales Gerät) über die Verarbeitung bis zum Einspielen in das zentrale Superbrain (GBrain) — auf Produktionsreife, Vollständigkeit, Robustheit und Kanzlei-Tauglichkeit.

---

## 1. PRÜFUMFANG

### 1.1 Datenquellen & Ingestion-Kanäle

Prüfe systematisch jeden der folgenden Datenkanäle:

| Kanal | Erwartete Funktionalität | Status |
|-------|-------------------------|--------|
| **PDF-Upload** | Text-Layer-Extraction (unpdf) + OCR-Fallback für gescannte PDFs (pdf2pic + Vision-Model) | ❓ |
| **DOCX-Upload** | Text-Extraction via mammoth, Frontmatter-Synthese | ❓ |
| **Bild-Upload (PNG/JPG/etc.)** | OCR via Vision-Model, Metadaten-Extraction | ❓ |
| **EML-Dateien** | Parsing via postal-mime, Header-Extraction (From/To/Date/Subject), Attachment-Handling | ❓ |
| **CSV/TSV/XLSX** | Tabellen-Extraction, strukturierte Verarbeitung | ❓ |
| **Audio (MP3/WAV/M4A/OGG/FLAC)** | Transkription via Groq Whisper / OpenAI Whisper | ❓ |
| **Gmail-Connector** | OAuth2, Delta-Sync via historyId, Label-Filter, Thread-Grouping, Attachment-Forwarding | ❓ |
| **Google Drive-Connector** | OAuth2, Delta-Sync via changes API, Webhook-Push, Folder-Filter, DOCX/PDF-Download | ❓ |
| **Google Calendar-Connector** | OAuth2, syncToken-Delta, Event-Structuring, Multi-Calendar | ❓ |
| **Dropbox-Connector** | OAuth2/Long-lived-Token, list_folder/continue Delta-Sync, Binary-Download | ❓ |
| **Notion-Connector** | API-Key, Database-Filter, Page-Extraction | ❓ |
| **GitHub-Connector** | PAT, Repo-Issues/PRs/Docs, Delta-Sync | ❓ |
| **Slack-Connector** | Bot-Token, Channel-Filter, Message-Extraction | ❓ |
| **Asana-Connector** | PAT, Project-Filter, Task-Extraction | ❓ |
| **Jira-Connector** | PAT/Base-URL, JQL-Filter, Issue-Extraction | ❓ |
| **beA-Import-Connector** | Anwaltlicher Nachrichtenverkehr, beA-spezifische Auth & Parsing | ❓ |
| **Legal-Judgements-Connector** | DE-Gerichtsentscheidungen, Delta-Sync | ❓ |
| **Swiss-Judgements-Connector** | CH-Gerichtsentscheidungen, Delta-Sync | ❓ |
| **Eur-Lex-Connector** | EU-Rechtsprechung, Delta-Sync | ❓ |
| **E-Mail-Import (Web-UI)** | Manueller Import, Case-Matching (Aktenzeichen/Client/Opponent), Dedup | ❓ |
| **Webhook-Ingestion** | HTTP POST /ingest, OAuth-Gate, untrusted_payload-Flag | ❓ |
| **File-Watcher (lokal)** | chokidar-basiert, Markdown-Files, Debounce, awaitWriteFinish | ❓ |
| **Inbox-Folder (lokal)** | Ordner-Überwachung für Drop-Dateien | ❓ |
| **iCloud-Integration** | iCloud Drive / iCloud Mail — FEHLT? Prüfen! | ❓ |
| **Lokales Gerät (Scanner/Camera)** | Direkter Scan-Upload, Mobile-App-Capture (Capacitor) | ❓ |
| **WhatsApp-Integration** | WhatsApp Business API, Message-Ingest | ❓ |
| **DocuSign-Integration** | Signed Document Import, Status-Sync | ❓ |
| **Word-Add-In** | Direkte Word-Dokument-Einreichung aus MS Word | ❓ |

### 1.2 Verarbeitungs-Pipeline

Prüfe jede Verarbeitungsstufe:

1. **Upload-Layer** (`/api/upload/route.ts`)
   - Datei-Validierung (Typ, Größe, MIME-Mismatch)
   - Viren-Scan (ClamAV + Executable-Detection)
   - Filename-Sanitization
   - Quota-Tracking
   - Auto-Analysis-Trigger nach Upload

2. **Document-Extraction** (`extract-document.ts`)
   - PDF: unpdf Text-Layer → sparse-Detection → OCR-Fallback (pdf2pic + Vision)
   - DOCX: mammoth extractRawText
   - EML: postal-mime (Header + Body + Attachment-Warning)
   - CSV/TSV/XLSX: Tabellen-Parsing
   - Audio: Whisper-Transkription
   - Unverified-Banner für OCR/Transkription (rechtlicher Warnhinweis)

3. **Ingestion-Daemon** (`daemon.ts`)
   - Source-Supervision (crash-counter, exponential backoff, maxCrashes)
   - Event-Validation an der Boundary
   - 24h Content-Hash Dedup (trickle-mode)
   - Migration-mode (bulk, bypasses dedup)
   - Per-Source Rate-Limiting (token bucket)
   - Health-Check-Surface

4. **Connector-Manager** (`connectors/manager.ts`)
   - Registry-Persistence (`~/.gbrain/connectors.json`)
   - Add/Remove/Enable/Disable/List
   - OAuth2-Flow (Google PKCE)
   - Per-Connector State-Persistence
   - CLI-Commands (`gbrain connector add/auth/sync/status/...`)

5. **Ingest-Capture Handler** (`minions/handlers/ingest-capture.ts`)
   - Slug-Resolution (caller → metadata → auto-generated `inbox/YYYY-MM-DD-hash6`)
   - Trust-Posture (untrusted_payload propagation)
   - Binary-Content-Gap: wirft Error für image/audio/video/pdf ohne Processor-Skillpack
   - Import via `importFromContent`

6. **Import-File Pipeline** (`import-file.ts`)
   - Document-Detection → extractDocumentText → synthesizeDocumentMarkdown
   - Code-File-Routing
   - Frontmatter-Inference
   - Markdown-Parsing
   - Chunking & Embedding

### 1.3 Superbrain / GBrain Core

Prüfe die Kern-Engine:

1. **Think-Pipeline** (`think/index.ts`)
   - INTENT → GATHER → SYNTHESIZE → optional COMMIT
   - Citation-Grounding (anti-hallucination)
   - Multi-Round-Scaffolding
   - Streaming-Support
   - Trajectory-Integration (v0.40.2)

2. **Legal-Engine** (`legal/`)
   - `analyze-document.ts`: Proaktive Issue-Spotting mit Quote-Grounding
   - `contract-draft.ts`: Vertragsentwurf
   - `contract-redline.ts`: Vertragsredlining
   - `document-review.ts`: Dokument-Review
   - `due-diligence.ts`: Due-Diligence
   - `memo.ts`: Memo-Generierung
   - `risk-analysis.ts`: Risiko-Analyse
   - `summarize.ts`: Zusammenfassung
   - `repository.ts`: Rechtsprechungs-Repository
   - `anonymizer.ts`: Anonymisierung (DSGVO-konform)
   - `split-statute.ts`: Gesetzes-Parsing

3. **AI-Gateway** (`ai/gateway.ts`)
   - Multi-Provider (Anthropic, OpenAI, Groq)
   - Model-Resolver (6-Tier-Chain)
   - OCR via Vision-Model
   - Chat/Completion
   - Embedding

4. **Search & Retrieval** (`search/`)
   - Vector-Suche (pgvector)
   - Hybrid-Suche (keyword + semantic)
   - Reranking
   - Contextual-Retrieval-Service

5. **Embedding-Pipeline**
   - Chunking-Strategien
   - Embedding-Model-Support
   - Stale-Embedding-Detection
   - Backfill-Mechanismus

6. **Frontend-Integration** (`src/lib/engine.ts`)
   - Multi-Tenant-Scoping (brainId per User/Org)
   - RBAC + Rate-Limit + Quota
   - Server-to-Server Auth (API-Key)
   - Session-Management

---

## 2. PRÜFKRITERIEN (je Kanal/Komponente)

### 2.1 Funktionalität
- [ ] Ist die Komponente vollständig implementiert (kein Mock, kein Platzhalter)?
- [ ] Sind alle Userflows durchspielbar (CRUD, Error, Empty, Edge-Case)?
- [ ] Gibt es tote UI-Elemente oder nicht funktionierende Buttons?
- [ ] Funktioniert der End-to-End-Flow: Quelle → Ingestion → Processing → Brain-Page → Searchable?

### 2.2 Daten-Integrität
- [ ] Werden Dateien korrekt extrahiert (Text geht nicht verloren)?
- [ ] Ist die Dedup-Funktionalität korrekt (keine Duplicate-Pages)?
- [ ] Werden Metadaten (Frontmatter) korrekt synthetisiert?
- [ ] Bleibt die Provenance erhalten (woher kommt der Content)?
- [ ] Werden Attachments von E-Mails behandelt (nicht nur der Body)?

### 2.3 Fehler-Handling & Robustheit
- [ ] Was passiert bei API-Ausfällen (Google, Dropbox, etc.)?
- [ ] Was passiert bei abgelaufenen OAuth-Tokens?
- [ ] Was passiert bei korrupten Dateien (PDF ohne Text, leere DOCX)?
- [ ] Was passiert bei Rate-Limit-Exceedance?
- [ ] Gibt es Retry-Logic mit Exponential-Backoff?
- [ ] Werden Fehler geloggt und im `gbrain doctor` sichtbar?

### 2.4 Sicherheit & Compliance
- [ ] Werden untrusted Payloads korrekt markiert (webhook sources)?
- [ ] Ist der Viren-Scan aktiv und funktional?
- [ ] Sind OAuth-Tokens sicher gespeichert (`~/.gbrain/connectors/`)?
- [ ] Werden sensible Daten (Client-Namen, Aktenzeichen) bei Bedarf anonymisiert?
- [ ] Ist die DSGVO-Compliance gewahrt (Recht auf Vergessenwerden)?
- [ ] Gibt es eine GoBD-konforme Verfahrensdokumentation?
- [ ] Sind AI-generierte Inhalte klar als solche markiert?

### 2.5 Kanzlei-Spezifische Anforderungen
- [ ] Funktioniert das Case-Matching (E-Mail → Akte via Aktenzeichen/Client)?
- [ ] Werden Fristen aus Dokumenten extrahiert und überwacht?
- [ ] Ist die beA-Integration funktional (anwaltsspezifischer Nachrichtenverkehr)?
- [ ] Funktioniert die Rechtsprechungs-Suche (DE/AT/CH)?
- [ ] Ist die RVG-Kostenberechnung integriert?
- [ ] Gibt es eine Mandanten-Separation (Multi-Tenant-Isolation)?

### 2.6 Performance & Scale
- [ ] Wie performant ist die PDF-Extraction bei großen Dateien (50MB+)?
- [ ] Wie skaliert der File-Watcher bei 10K+ Dateien?
- [ ] Sind Embedding-Operationen asynchron und nicht-blockierend?
- [ ] Gibt es Batch-Processing für Bulk-Imports?

---

## 3. BEKANNNTE GAPS & RISIKEN (zu verifizieren)

### 3.1 Binary Content Gap (KRITISCH)
Im `ingest-capture.ts` (Zeile 97-108) wird **jeder binäre Content-Type** (image/*, audio/*, video/*, application/pdf) mit einem Error abgewiesen, wenn kein Processor-Skillpack installiert ist. Das bedeutet:
- Bilder (PNG/JPG) werden **nicht** OCR'd beim Ingest — sie landen nicht im Brain
- PDFs über Connectors (Google Drive, Dropbox) werden als base64 gespeichert, aber nicht text-extrahiert
- Audio-Dateien werden nicht transkribiert beim Ingest

**Prüfung:** Ist diese Gap dokumentiert? Gibt es Skillpacks, die das schließen? Ist der User-Flow klar, wenn er ein Bild hochlädt und es nicht im Brain landet?

### 3.2 iCloud-Integration (FEHLEND)
Es gibt **keinen** iCloud-Connector. Weder für iCloud Drive noch für iCloud Mail. In der `CONNECTOR_REGISTRY` in `manager.ts` ist iCloud nicht registriert.

**Prüfung:** Wird iCloud benötigt? Wenn ja, wie sollte der Connector aussehen? Apple CloudKit API / iCloud Drive API.

### 3.3 WhatsApp-Integration (PARTIELL)
Es gibt WhatsApp-Code in `src/lib/whatsapp/` und API-Routes unter `/api/whatsapp/`, aber kein Connector in der Ingestion-Pipeline.

**Prüfung:** Ist WhatsApp als Ingestion-Source angebunden oder nur als Outbound-Messaging?

### 3.4 DocuSign-Integration (PARTIELL)
DocuSign-Code in `src/lib/docusign.ts` und API-Routes unter `/api/docusign/`, aber kein Ingestion-Connector.

**Prüfung:** Werden signierte Dokumente automatisch ins Brain eingespielt?

### 3.5 E-Mail-Attachment-Handling (LÜCKE)
Der Gmail-Connector erkennt Attachments (Zeile 146-152), aber extrahiert sie nicht. Der EML-Parser warnt nur ("attachment(s) not extracted").

**Prüfung:** Werden E-Mail-Attachments (PDFs, DOCX) automatisch ins Brain importiert?

### 3.6 Mobile / Lokales Gerät
Es gibt `capacitor.config.ts` und `mobile/README.md`, aber unklar ob der Mobile-Upload-Pipeline funktional ist.

**Prüfung:** Kann ein Anwalt vom Handy ein Foto eines Dokuments machen und es landet im Brain?

### 3.7 Word-Add-In
Es gibt `word-addin/` mit Taskpane, aber unklar ob die Einreichung ins Brain funktional ist.

**Prüfung:** Kann ein Anwalt aus MS Word direkt ins Brain speichern?

---

## 4. ARCHITEKTUR-PRÜFUNG

### 4.1 Datenfluss-Integrität
```
Quelle (PDF/Bild/E-Mail/Google/iCloud/Lokal)
  ↓ Upload/Connector/Watcher
Ingestion-Event (content_type + content + hash + metadata)
  ↓ Daemon (validate → dedup → rate-limit → dispatch)
ingest_capture Handler (slug-resolution → importFromContent)
  ↓ extract-document.ts (PDF→Text, DOCX→Text, EML→Text, Audio→Text)
import-file.ts (frontmatter-inference → markdown-parse → chunk → embed)
  ↓
Brain-Page (slug, frontmatter, content, embeddings)
  ↓
Search / Think / Legal-Engine (retrieval + synthesis + analysis)
  ↓
Dashboard / Kanzlei-OS (UI für Anwälte)
```

**Prüfe jeden Pfeil im Flow:** Ist der Übergang fehlerfrei? Gehen Daten verloren? Gibt es Race-Conditions?

### 4.2 Connector-Architektur
- BaseConnector: OAuth2, Rate-Limit, Retry, Delta-Sync, Health-Check
- Jeder Connector erbt und implementiert: `fetchDelta`, `toIngestionEvent`, `refreshToken`, `getApiRateLimit`
- ConnectorManager: Registry, Add/Remove, Load-Enabled
- Daemon-Integration: `startConnectorIngestion()` auto-startet alle enabled Connectors

**Prüfe:** Ist das Pattern konsistent? Gibt es Connectors, die vom Pattern abweichen? Sind alle Connectors production-ready?

### 4.3 Frontend-Backend-Seam
- Next.js API-Routes → Engine-Proxy (ENGINE_URL = localhost:3001)
- Multi-Tenant: `x-subsumio-source` Header = brainId
- Auth: Session-Cookie → engineContext() → headers mit API-Key
- RBAC: `requireEngineContext()` prüft Action-Permission + Rate-Limit + Quota

**Prüfe:** Ist die Seam sicher? Kann ein Tenant den Brain eines anderen lesen? Sind alle API-Routes gehärtet?

---

## 5. TEST-COVERAGE-PRÜFUNG

Für jede Komponente prüfe:
- [ ] Gibt es Unit-Tests?
- [ ] Gibt es Integration-Tests?
- [ ] Gibt es E2E-Tests?
- [ ] Sind Edge-Cases getestet (leere Dateien, sehr große Dateien, korrupte Dateien)?
- [ ] Sind Error-Paths getestet (API-Ausfall, Token-Expiry, Rate-Limit)?

Spezifisch:
- [ ] `server/test/ingestion/connectors.test.ts` — Connector-Tests
- [ ] `server/test/bea-import-connector.test.ts` — beA-Tests
- [ ] `server/test/oauth.test.ts` — OAuth-Tests
- [ ] `tests/e2e-playwright/` — E2E-Tests
- [ ] Extract-Document-Tests (PDF/DOCX/EML/Audio)

---

## 6. DEFINITION OF DONE

Der Audit ist abgeschlossen, wenn für **jeden** Datenkanal und **jede** Verarbeitungstufe folgende Fragen beantwortet sind:

1. **Ist es implementiert?** (Ja/Nein/Partiell)
2. **Ist es production-ready?** (Ja/Nein/Mit Einschränkungen)
3. **Was fehlt?** (Konkrete Liste der Gaps)
4. **Was ist kritisch?** (Blocker für Kanzlei-Betrieb)
5. **Was ist nice-to-have?** (Verbesserungen, keine Blocker)
6. **Welche Tests fehlen?** (Konkrete Test-Cases)
7. **Empfohlene Priorität?** (P0=Blocker, P1=Kritisch, P2=Wichtig, P3=Nice-to-have)

---

## 7. AUSGABEFORMAT

Der Audit-Report soll folgende Struktur haben:

### 7.1 Executive Summary
- Gesamtbewertung (Production-Ready / Beta / Alpha)
- Anzahl Blocker / Kritisch / Wichtig
- Top-5-Empfehlungen

### 7.2 Kanal-Weise Detail-Analyse
Pro Kanal:
- Status (Implementiert/Partiell/Fehlt)
- Funktionalitäts-Checkliste (aus §2.1)
- Gefundene Issues (mit Severity)
- Test-Coverage
- Empfohlene Aktionen

### 7.3 Architektur-Bewertung
- Datenfluss-Integrität
- Security-Posture
- Scalability
- Kanzlei-Specific Readiness

### 7.4 Gap-Analyse
- Fehlende Connectors (iCloud, etc.)
- Binary-Content-Gap
- Attachment-Handling
- Mobile/Word-Add-In Status

### 7.5 Priorisierte Action-Items
| Priority | Item | Kanal | Aufwand | Impact |
|----------|------|-------|---------|--------|
| P0 | ... | ... | S/M/L | ... |
| P1 | ... | ... | S/M/L | ... |
| P2 | ... | ... | S/M/L | ... |

### 7.6 Test-Plan
- Fehlende Tests pro Komponente
- Empfohlene E2E-Test-Szenarien
- Regression-Test-Checkliste

---

## 8. KONTEXT-DATEIEN

Die folgenden Dateien sind für den Audit relevant:

### Ingestion & Connectors
- `server/src/core/ingestion/daemon.ts` — IngestionDaemon
- `server/src/core/ingestion/types.ts` — IngestionEvent/Source Contract
- `server/src/core/ingestion/connectors/manager.ts` — ConnectorManager + Registry
- `server/src/core/ingestion/connectors/base.ts` — BaseConnector
- `server/src/core/ingestion/connectors/gmail.ts` — Gmail
- `server/src/core/ingestion/connectors/google-drive.ts` — Google Drive
- `server/src/core/ingestion/connectors/google-oauth.ts` — Google OAuth2 PKCE
- `server/src/core/ingestion/connectors/calendar.ts` — Google Calendar
- `server/src/core/ingestion/connectors/dropbox.ts` — Dropbox
- `server/src/core/ingestion/connectors/notion.ts` — Notion
- `server/src/core/ingestion/connectors/github.ts` — GitHub
- `server/src/core/ingestion/connectors/slack.ts` — Slack
- `server/src/core/ingestion/connectors/asana.ts` — Asana
- `server/src/core/ingestion/connectors/jira.ts` — Jira
- `server/src/core/ingestion/connectors/bea-import.ts` — beA
- `server/src/core/ingestion/connectors/legal-judgements.ts` — DE Gerichtsentscheidungen
- `server/src/core/ingestion/connectors/swiss-judgements.ts` — CH Gerichtsentscheidungen
- `server/src/core/ingestion/connectors/eur-lex.ts` — EU Rechtsprechung
- `server/src/core/ingestion/connectors/daemon-integration.ts` — Daemon Auto-Start
- `server/src/core/ingestion/sources/file-watcher.ts` — Lokaler File-Watcher
- `server/src/core/ingestion/sources/inbox-folder.ts` — Inbox-Folder Source

### Document Processing
- `server/src/core/extract-document.ts` — PDF/DOCX/EML/CSV/XLSX/Audio Extraction
- `server/src/core/import-file.ts` — Import-Pipeline (1740 Zeilen)
- `server/src/core/minions/handlers/ingest-capture.ts` — Ingest-Capture Handler

### Brain Core
- `server/src/core/engine.ts` — BrainEngine (97K)
- `server/src/core/think/index.ts` — Think-Pipeline
- `server/src/core/legal/analyze-document.ts` — Legal Document Analysis
- `server/src/core/legal/repository.ts` — Rechtsprechungs-Repository
- `server/src/core/ai/gateway.ts` — AI-Gateway (Multi-Provider)
- `server/src/core/search/` — Search & Retrieval

### Frontend Integration
- `src/lib/engine.ts` — Engine-Proxy (Multi-Tenant, RBAC, Quota)
- `src/app/api/upload/route.ts` — Upload-Endpoint
- `src/app/api/email-import/route.ts` — E-Mail-Import
- `src/app/api/connectors/route.ts` — Connector-Management API
- `src/lib/dms/` — DMS-Integration (netDocuments)
- `src/lib/docusign.ts` — DocuSign
- `src/lib/whatsapp/` — WhatsApp
- `src/lib/virus-scan.ts` — Viren-Scanner
- `src/lib/upload-validation.ts` — Upload-Validierung

### Mobile & Add-Ins
- `capacitor.config.ts` — Mobile-App Config
- `mobile/README.md` — Mobile-Doku
- `word-addin/` — Word-Add-In

### Tests
- `server/test/ingestion/connectors.test.ts`
- `server/test/bea-import-connector.test.ts`
- `server/test/oauth.test.ts`
- `tests/e2e-playwright/` — E2E-Tests

---

## 9. AUDIT-MODUS

Führe den Audit in folgenden Phasen durch:

### Phase 1: Code-Inspection
Lese jede der in §8 gelisteten Dateien und prüfe gegen die Kriterien aus §2.

### Phase 2: Flow-Verifikation
Trace den vollständigen Datenfluss (§4.1) für jeden Kanal von Quelle bis Brain-Page.

### Phase 3: Gap-Analyse
Identifiziere alle fehlenden oder partiellen Implementierungen (§3).

### Phase 4: Test-Audit
Prüfe Test-Coverage für jede Komponente (§5).

### Phase 5: Edge-Case-Simulation
Simuliere: leere Datei, 100MB PDF, abgelaufener Token, Rate-Limit-Exceedance, gleichzeitige Uploads, korrupte DOCX, gescannte PDF ohne Text.

### Phase 6: Security-Audit
Prüfe: untrusted_payload-Handling, OAuth-Token-Storage, Multi-Tenant-Isolation, Viren-Scan, SQL-Injection, XSS.

### Phase 7: Final Report
Erstelle den Audit-Report im Format aus §7.

---

*Dieser Prompt ist selbstanwendend: Führe jeden Prüfpunkt systematisch ab und dokumentiere das Ergebnis.*
