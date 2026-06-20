# Subsumio Brain Engine — Vollständiger Audit-Report

**Datum:** 2026-06-20  
**Auditor:** Cascade (Principal Engineer, Product Architect, UX Lead, QA Lead)  
**Scope:** Data Ingestion, Document Processing, Superbrain Integration, Frontend-Anbindung, Security, Law-Firm-Suitability  
**Codebase:** `/Users/msc/subsumio-web` (Server: `server/src/core/`, Frontend: `src/`)

---

## 1. Executive Summary

Der Subsumio Brain Engine ist eine **architektonisch reife, gut strukturierte** GBrain-Fork mit einer klar definierten Ingestion-Pipeline, einem robusten Connector-Framework und durchdachter Security-Posture. Die Engine ist **bedingt produktionsreif** — die Kern-Pipeline (Text-Ingestion → Brain-Page → Embedding → Search) funktioniert vollständig, aber mehrere Integrationskanäle haben Lücken, die für den Kanzlei-Einsatz kritisch sein können.

**Gesamtbewertung:** 🟡 **Bedingt produktionsreif (70%)**

| Bereich | Score | Status |
|---|---|---|
| Kern-Ingestion-Pipeline | 90% | ✅ Produktionsreif |
| Connector-Framework | 85% | ✅ Produktionsreif |
| Dokument-Extraktion | 75% | 🟡 Fast fertig |
| Frontend-Integration | 80% | ✅ Produktionsreif |
| WhatsApp-Integration | 60% | 🟡 Partiell |
| DocuSign-Integration | 65% | 🟡 Partiell |
| Mobile / Word-Add-In | 40% | 🔴 Rudimentär |
| Security & Compliance | 82% | 🟡 Gut, mit Lücken |
| Test-Coverage | 78% | 🟡 Solide für Kern, dünn für Integrations |
| Law-Firm-Suitability | 72% | 🟡 Braucht Lücken-Schließung |

**Top 5 kritische Action-Items:**
1. **E-Mail-Attachment-Extraktion** — Gmail-Connector listet Attachments, extrahiert sie aber nicht
2. **Binary Content Gap im ingest-capture Handler** — Binary-Typen werden pauschal abgelehnt
3. **DocuSign Multi-Tenant-Isolation** — Webhook nutzt `SIGMABRAIN_BRAIN || "default"` statt Tenant-Routing
4. **WhatsApp Media → Brain-Pipeline** — Media wird gespeichert, aber nicht in Brain ingestiert
5. **Word-Add-In** — Hardcoded API-URL, kein Token-Refresh, keine Upload-Funktion

---

## 2. Channel-Wise Detail-Analyse

### 2.1 PDF-Upload (Web-UI)

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja (mit Einschränkungen bei gescannten PDFs)

**Datenfluss:**
```
Browser → POST /api/upload (Next.js)
  → validateUpload (MIME-Check, 50MB-Limit)
  → scanFile (Magic-Bytes, Executable-Detection, optional ClamAV)
  → Forward to ENGINE_URL/api/upload (GBrain Server)
  → extractDocumentText (unpdf → Text-Layer oder OCR-Fallback)
  → importFromContent → Brain-Page + Embedding
```

**Bewertung:**
- ✅ MIME-Allowlist mit 10 Typen (`@/Users/msc/subsumio-web/src/lib/upload-validation.ts:7-18`)
- ✅ Magic-Byte-Validierung gegen MIME-Spoofing (`@/Users/msc/subsumio-web/src/lib/virus-scan.ts:25-33`)
- ✅ Executable-Detection (PE/ELF/MachO/Java) (`@/Users/msc/subsumio-web/src/lib/virus-scan.ts:16-22`)
- ✅ Optional ClamAV-Integration via TCP INSTREAM (`@/Users/msc/subsumio-web/src/lib/virus-scan.ts:101-169`)
- ✅ Filename-Sanitization (`@/Users/msc/subsumio-web/src/lib/upload-validation.ts:37-43`)
- ✅ Auto-Legal-Analysis nach Upload (best-effort, silent failure) (`@/Users/msc/subsumio-web/src/app/api/upload/route.ts:74-94`)
- ✅ OCR-Fallback für gescannte PDFs via pdf2pic + Vision-Model (`@/Users/msc/subsumio-web/server/src/core/extract-document.ts:156-207`)
- ✅ Unverified-Banner für OCR/Transcription-Ergebnisse (`@/Users/msc/subsumio-web/server/src/core/extract-document.ts:62-76`)
- ⚠️ OCR-Fallback schlägt still fehl, wenn pdf2pic/poppler nicht installiert → nur Warning, kein Error
- ⚠️ Keine PDF-Größenbeschränkung pro Seite (50MB-Grenze ist raw file, nicht Seitenanzahl)

**Fehlt:** PDF/A-Validierung für Langzeitarchivierung (Kanzlei-relevant)

---

### 2.2 DOCX-Upload

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Datenfluss:** Wie PDF, aber Extraktion via `mammoth.extractRawText` (`@/Users/msc/subsumio-web/server/src/core/extract-document.ts:209-220`)

**Bewertung:**
- ✅ Pure-JS-Extraktion (mammoth), keine nativen Dependencies
- ✅ Warning-Messages werden als non-fatal warnings gesammelt
- ✅ Whitespace-Normalisierung
- ⚠️ Keine Format-Information (Bold, Italic, Tabellen) — nur Raw-Text
- ⚠️ Keine Header/Footer-Extraktion

---

### 2.3 EML-Import

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja (mit Attachment-Gap)

**Datenfluss:** Wie PDF, aber Extraktion via `postal-mime` (`@/Users/msc/subsumio-web/server/src/core/extract-document.ts:222-267`)

**Bewertung:**
- ✅ From/To/Cc/Date/Subject-Header-Extraktion
- ✅ Plain-Text-Preference, HTML-Tag-Stripping als Fallback
- ✅ Frontmatter mit `type: email`, `source_format: eml`
- 🔴 **Attachments werden erkannt aber NICHT extrahiert** — nur Warning-Message (`@/Users/msc/subsumio-web/server/src/core/extract-document.ts:261-263`)
- 🔴 Keine MIME-Multipart-Verarbeitung für eingebettete Attachments

**Kritisch für Kanzlei:** E-Mail-Attachments (Klagen, Urteile, Verträge) gehen verloren.

---

### 2.4 CSV/TSV/XLSX-Import

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ CSV/TSV: Direkter Text-Import (`@/Users/msc/subsumio-web/server/src/core/extract-document.ts:269-284`)
- ✅ XLSX: Sheet-weise CSV-Konvertierung via `xlsx`-Library (`@/Users/msc/subsumio-web/server/src/core/extract-document.ts:286-300`)
- ✅ Sheet-Namen als Section-Header
- ⚠️ Keine Zell-Typ-Erhaltung (Datumsformate, Zahlenformate)

---

### 2.5 Audio-Transkription

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja (mit Provider-Abhängigkeit)

**Datenfluss:**
```
Audio-File → extractAudio → transcribeBuffer (Groq/OpenAI Whisper)
  → Segments mit Timestamps → Unverified-Banner → Brain-Page
```

**Bewertung:**
- ✅ Groq-Whisper als Default (schnell, günstig), OpenAI als Fallback (`@/Users/msc/subsumio-web/server/src/core/transcription.ts:1-7`)
- ✅ ffmpeg-Segmentierung für Files >25MB (`@/Users/msc/subsumio-web/server/src/core/transcription.ts:6`)
- ✅ Segment-Level-Timestamps in Transkription
- ✅ Unverified-Banner für rechtliche Nutzung (`@/Users/msc/subsumio-web/server/src/core/extract-document.ts:68-72`)
- ✅ Language-Detection, Provider-Attribution in Frontmatter
- ⚠️ Keine Speaker-Diarization in der Default-Konfiguration
- ⚠️ Keine automatische Löschung der Audio-Datei nach Transkription (DSGVO-relevant)

---

### 2.6 Gmail-Connector

**Implementiert:** ✅ Ja  
**Produktionsreif:** 🟡 Partiell

**Datenfluss:**
```
GmailConnector.fetchDelta → Gmail API (historyId delta)
  → Message-Header + Body → toIngestionEvent → IngestionDaemon
  → ingest-capture Handler → importFromContent → Brain-Page
```

**Bewertung:**
- ✅ OAuth2 mit PKCE-Flow (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/google-oauth.ts:63-84`)
- ✅ Delta-Sync via `historyId` (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/gmail.ts`)
- ✅ Label-Filtering
- ✅ Token-Refresh via BaseConnector
- 🔴 **Attachments werden erkannt (metadata) aber NICHT extrahiert** — nur `console.warn` (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/gmail.ts`)
- ⚠️ Keine Verarbeitung von verschachtelten MIME-Strukturen
- ⚠️ Body nur als plain-text, HTML-Mails verlieren Formatierung

**Kritisch für Kanzlei:** E-Mail-Attachments (Klagen, Urteile, Verträge) gehen verloren.

---

### 2.7 Google Drive-Connector

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ OAuth2 mit PKCE
- ✅ Delta-Sync via Drive API changes
- ✅ Google Workspace Native-Format-Export (Docs → text, Sheets → CSV) (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/google-drive.ts`)
- ✅ Binary-Download (PDF, DOCX) als base64
- ✅ Folder-Filtering
- ✅ Optional Webhook-Push-Notifications
- ⚠️ Base64-Inhalt wird an ingest-capture weitergereicht, der aktuell **nur Text-Typen akzeptiert** → Binary wird abgelehnt

---

### 2.8 Google Calendar-Connector

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ OAuth2-Token-Refresh
- ✅ syncToken-basierte Delta-Sync (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/calendar.ts:72-77`)
- ✅ syncToken-Expiry-Recovery (410 → Full-Sync-Fallback) (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/calendar.ts:86-88`)
- ✅ Multi-Calendar-Support
- ✅ Cancelled-Events werden gefiltert
- ✅ Attendee-Information mit Response-Status

---

### 2.9 Dropbox-Connector

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ Long-lived Access-Token (kein Refresh nötig)
- ✅ Delta-Sync via `files/list_folder/continue` (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/dropbox.ts`)
- ✅ Binary-Download als base64
- ⚠️ Same Binary-Gap wie Google Drive — base64 wird an ingest-capture weitergereicht, der Binary ablehnt

---

### 2.10 Notion-Connector

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ API-Key-Auth (Integration Tokens, kein OAuth2 nötig)
- ✅ Delta-Sync via `last_edited_time`-Polling (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/notion.ts:53-114`)
- ✅ Block-Level-Content-Extraktion (Paragraph, Headings, Lists, Code, Quote, Divider, ToDo) (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/notion.ts:149-191`)
- ⚠️ Keine Pagination bei Block-Children (nur erste 100 Blocks)
- ⚠️ Keine Sub-Page-Hierarchie (nur Top-Level-Blocks)
- ⚠️ Frontmatter wird als Plain-String gebaut, nicht via `js-yaml` → potenzielle Injection durch Title mit `:` oder `"`

---

### 2.11 GitHub-Connector

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ PAT-Auth
- ✅ Delta-Sync via `updated_at` + ETag
- ✅ Issue/PR-Extraktion mit Comments
- ✅ Label/Milestone-Filtering
- ✅ Auto-Discovery watched Repos (wenn keine `repos` konfiguriert)
- ⚠️ Frontmatter wird als Plain-String gebaut (gleiche Injection-Risiko wie Notion)
- ⚠️ Keine Discussion-Support (nur Issues/PRs, despite Doku-Kommentar)

---

### 2.12 Slack-Connector

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ Bot-Token-Auth
- ✅ Channel-Filtering
- ✅ Timestamp-basierter Cursor
- ✅ System/Bot-Message-Filterung
- ⚠️ Keine Thread-Replies (nur Top-Level-Messages)
- ⚠️ Keine File/Attachment-Extraktion

---

### 2.13 Asana-Connector

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ PAT-Auth
- ✅ `modified_since`-Delta-Sync
- ✅ Workspace/Project-Filtering
- ✅ Task-Metadata (Assignee, Due, Tags, Projects)
- ⚠️ Keine Comment-Extraktion

---

### 2.14 Jira-Connector

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ Email:API-Token-Auth (Basic Auth)
- ✅ JQL-basierte Delta-Sync mit `updated >=` Cursor (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/jira.ts:73-84`)
- ✅ Project/IssueType/Label-Filtering
- ✅ ADF (Atlassian Document Format) Description-Extraction (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/jira.ts:172-192`)
- ✅ Comment-Extraktion
- ⚠️ Keine Pagination (nur `maxResults`, kein `pageLoop`)

---

### 2.15 beA-Import

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ Local-Directory-Monitoring für XML-Exporte
- ✅ XML-Parsing mit `fast-xml-parser` (Namespace, CDATA, Entity-Support) (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/bea-import.ts`)
- ✅ Sender/Recipient/Subject/Body-Extraktion
- ✅ `js-yaml` für sichere Frontmatter-Serialisierung
- 🔴 **Attachments werden aufgelistet, aber nicht extrahiert** — gleiche Binary-Gap
- ⚠️ Keine DSGVO-konforme Löschung nach Import

---

### 2.16 Legal Judgements (DE/AT/EU/CH)

**Implementiert:** ✅ Ja (4 Connectoren)  
**Produktionsreif:** ✅ Ja

**Connectoren:**
- `LegalJudgementsConnector` — RIS-OGD (AT) + OpenLegalData (DE) (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/legal-judgements.ts`)
- `EurLexConnector` — EUR-Lex + Curia (EU) (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/eur-lex.ts`)
- `SwissJudgementsConnector` — OpenCaseLaw.ch (CH) (`@/Users/msc/subsumio-web/server/src/core/ingestion/connectors/swiss-judgements.ts`)

**Bewertung:**
- ✅ Keine Auth nötig (öffentliche APIs)
- ✅ Full-Text-Fetch mit Budget-Limit (`maxDetailFetches`)
- ✅ HTML-Stripping via `stripHtml`
- ✅ Frontmatter mit Court, Date, Citation, Legal Area, Keywords
- ✅ `js-yaml` für sichere Frontmatter-Serialisierung
- ✅ Fallback auf Regeste/Metadata, wenn Full-Text nicht verfügbar
- ⚠️ Keine automatische Citation-Parsing/Linking
- ⚠️ Rate-Limits sind self-imposed, nicht API-dokumentiert

---

### 2.17 File-Watcher (Local)

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ chokidar-basiert (cross-platform: FSEvents/inotify/ReadDirectoryChangesW)
- ✅ `followSymlinks: false` (Security) (`@/Users/msc/subsumio-web/server/src/core/ingestion/sources/file-watcher.ts:29`)
- ✅ `pruneDir`-Integration (single source of truth für Exclusions)
- ✅ 1s-Debounce für Editor-Save-Storms
- ✅ `awaitWriteFinish` für atomare Writes
- ✅ inotify-ENOSPC-Detection mit sysctl-Hint (`@/Users/msc/subsumio-web/server/src/core/ingestion/sources/file-watcher.ts:211-217`)
- ✅ 60s-Ready-Timeout
- ✅ Markdown-only (`.md`, `.markdown`)
- ⚠️ Keine Delete-Events (nur additive Ingestion)

---

### 2.18 Inbox-Folder (Local Drop)

**Implementiert:** ✅ Ja  
**Produktionsreif:** ✅ Ja

**Bewertung:**
- ✅ Watcht `~/.gbrain/inbox/` für beliebige Datei-Drops
- ✅ Archive-Move nach `.archived/YYYY-MM-DD/` (Audit-Trail)
- ✅ Symlink-Rejection (layered defense) (`@/Users/msc/subsumio-web/server/src/core/ingestion/sources/inbox-folder.ts:175-178`)
- ✅ World-Writable-Warning (`@/Users/msc/subsumio-web/server/src/core/ingestion/sources/inbox-folder.ts:276-284`)
- ✅ Content-Type-Detection per Extension (text, image, audio, video, pdf, unknown)
- ✅ Binary-Files: Path+Stat als content_hash (O(1) statt O(filesize))
- ✅ `ignoreInitial: false` — ingested Files, die während Daemon-Offline dropped wurden
- ⚠️ Binary-Content wird als Pfad an Daemon gesendet, aber ingest-capture lehnt Binary ab

---

### 2.19 WhatsApp-Integration

**Implementiert:** 🟡 Partiell  
**Produktionsreif:** 🟡 Nein

**Datenfluss:**
```
WhatsApp Cloud API → POST /api/whatsapp/webhook
  → Signature-Verification → extractIncomingMessages
  → Text: handleLegalChatMessage → Legal-Chat-Reply
  → Media: downloadAndStoreWhatsAppMedia → handleLegalChatMedia
  → sendWhatsAppText (Reply)
```

**Bewertung:**
- ✅ Webhook-Signature-Verification (`x-hub-signature-256`) (`@/Users/msc/subsumio-web/src/app/api/whatsapp/webhook/route.ts:41-43`)
- ✅ Idempotency-Tracking (30min TTL, 5000-Entry-Cap) (`@/Users/msc/subsumio-web/src/app/api/whatsapp/webhook/route.ts:13-31`)
- ✅ Media-Download mit Größenlimit (25MB default) (`@/Users/msc/subsumio-web/src/lib/whatsapp/media.ts:32`)
- ✅ SHA256-Hash-Verifikation der Media-Datei
- ✅ Dual-Storage: Local FS oder Vercel-Blob (`@/Users/msc/subsumio-web/src/lib/whatsapp/media.ts:47-51`)
- ✅ Sender-Whitelist via `resolveSender` (`@/Users/msc/subsumio-web/src/app/api/whatsapp/webhook/route.ts:61-65`)
- 🔴 **Media wird gespeichert, aber NICHT in Brain ingestiert** — `handleLegalChatMedia` verarbeitet Media für Chat-Reply, aber es gibt keinen Flow von Media → Brain-Page
- 🔴 **Keine Brain-Page-Erstellung für WhatsApp-Nachrichten** — Nachrichten werden nur im Chat-Flow verarbeitet, nicht als Brain-Pages persistiert
- ⚠️ In-Memory-Idempotency funktioniert nicht bei Multi-Instance-Deployments (kein Redis/DB)
- ⚠️ Keine Rate-Limiting für ausgehende Nachrichten

---

### 2.20 DocuSign-Integration

**Implementiert:** 🟡 Partiell  
**Produktionsreif:** 🟡 Nein (Multi-Tenant-Problem)

**Datenfluss:**
```
DocuSign Connect → POST /api/docusign/webhook
  → HMAC-Verification (optional) → Status-Mapping
  → Brain-Search (docusign_envelope_id) → Brain-Page PATCH
```

**Bewertung:**
- ✅ OAuth2 + JWT Grant Flow (Service-Account) (`@/Users/msc/subsumio-web/src/lib/docusign.ts:70-80`)
- ✅ Per-User Token-Management via UserStore
- ✅ Idempotency-Tracking für Webhooks (`@/Users/msc/subsumio-web/src/app/api/docusign/webhook/route.ts:42-44`)
- ✅ HMAC-Signature-Verification (optional via `DOCUSIGN_CONNECT_SECRET`) (`@/Users/msc/subsumio-web/src/app/api/docusign/webhook/route.ts:47-59`)
- ✅ Status-Mapping (completed→signed, declined→declined, voided→expired)
- ✅ Envelope-Erstellung mit SignHere-Tabs
- 🔴 **Multi-Tenant-Isolation BROKEN** — Webhook nutzt `process.env.SIGMABRAIN_BRAIN || "default"` statt Tenant-Routing (`@/Users/msc/subsumio-web/src/app/api/docusign/webhook/route.ts:73`)
- 🔴 **HMAC-Verification ist OPTIONAL** — wenn `DOCUSIGN_CONNECT_SECRET` nicht gesetzt, wird Webhook ohne Verifikation akzeptiert
- ⚠️ Keine automatische Dokumenten-Extraktion nach Signing (signed PDF wird nicht in Brain ingestiert)
- ⚠️ In-Memory-Idempotency (gleiche Multi-Instance-Problematik wie WhatsApp)

---

### 2.21 E-Mail-Import (Web-UI)

**Implementiert:** ✅ Ja  
**Produktionsreif:** 🟡 Partiell

**Datenfluss:**
```
Web-UI → POST /api/email-import
  → Case-Matching (Aktenzeichen → Subject, Client-Email → From, Opponent-Name → From)
  → Brain-Page PATCH (documents array)
```

**Bewertung:**
- ✅ Zod-Schema-Validierung (`@/Users/msc/subsumio-web/src/app/api/email-import/route.ts:7-12`)
- ✅ 3-Stage Case-Matching (Aktenzeichen → Client → Opponent)
- ✅ Duplicate-Detection (gleicher From + gleicher Subject)
- ✅ Suggestions bei keinem Match (Top 5 Cases)
- 🔴 **E-Mail-Body wird auf 2000 Zeichen truncated** (`@/Users/msc/subsumio-web/src/app/api/email-import/route.ts:82`)
- 🔴 **Keine Attachment-Extraktion** — nur Body-Text wird gespeichert
- 🔴 **Kein echter Brain-Page-Import** — nur Frontmatter-Patch auf Case-Page (documents array), keine eigene Brain-Page
- ⚠️ Case-Matching ist O(n) über alle 500 legal_cases — skaliert nicht bei großen Kanzleien

---

### 2.22 Mobile (Capacitor)

**Implementiert:** 🟡 Rudimentär  
**Produktionsreif:** 🔴 Nein

**Bewertung:**
- ✅ Capacitor-Config vorhanden (`@/Users/msc/subsumio-web/capacitor.config.ts`)
- ✅ Server-URL-Strategie (lädt gehostete Web-App statt Bundle)
- ✅ Detaillierte Build- und Store-Submission-Doku (`@/Users/msc/subsumio-web/mobile/README.md`)
- 🔴 **Keine nativen Features implementiert** — Push, Biometrie, Share-Extension sind nur in Doku beschrieben
- 🔴 Keine `ios/` oder `android/` Verzeichnisse generiert
- 🔴 Keine Share-Extension für "An Subsumio senden"
- 🔴 Keine Scanner/Camera-Integration

---

### 2.23 Word-Add-In

**Implementiert:** 🟡 Rudimentär  
**Produktionsreif:** 🔴 Nein

**Bewertung:**
- ✅ Task-Pane mit Brain-Page-Liste und Insert-Funktion (`@/Users/msc/subsumio-web/word-addin/src/taskpane.ts`)
- ✅ HTML-Escaping in der UI
- 🔴 **Hardcoded API-URL** (`https://sigmabrain.com`) — keine Config (`@/Users/msc/subsumio-web/word-addin/src/taskpane.ts:13`)
- 🔴 **Kein Token-Refresh** — Token wird einmal eingegeben, nie erneuert
- 🔴 **Kein Upload** — nur Read + Insert, kein "Dokument → Brain"
- 🔴 Keine Fehlerbehandlung für Network-Timeouts
- 🔴 Keine Office-CoercionType für formatierten Text (nur `Office.CoercionType.Text`)

---

## 3. Architektur-Bewertung

### 3.1 Ingestion-Pipeline-Architecture

**Design-Pattern:** Plugin-based Ingestion Daemon with typed event contract

```
Sources → IngestionDaemon → Validation → Dedup → RateLimit → Dispatch
  → ingest-capture Handler → importFromContent → Brain-Page + Embedding
```

**Stärken:**
- ✅ **Typisierter IngestionEvent-Vertrag** (`IngestionEvent` mit `source_id`, `source_kind`, `content_type`, `content_hash`, `untrusted_payload`) — klar definierte API-Surface für Skillpack-Publisher
- ✅ **Source-Supervisor-Pattern** mit exponential Backoff, crash-counting, stable-run-reset (`@/Users/msc/subsumio-web/server/src/core/ingestion/daemon.ts`)
- ✅ **24h Content-Hash Dedup-Window** verhindert doppelte Ingestion
- ✅ **Per-Source Rate-Limiting** (Token-Bucket) mit konfigurierbaren Limits pro Connector
- ✅ **BaseConnector** abstrakte Klasse mit OAuth2-Token-Management, Delta-Sync, Backoff — reduziert Connector-Boilerplate erheblich
- ✅ **ConnectorManager** mit JSON-Persistenz, enable/disable-Lifecycle
- ✅ **Lazy-Import** von Parsern (PDF, DOCX, etc.) — zero startup cost für Markdown-only-Path

**Schwächen:**
- 🔴 **Binary Content Gap** — ingest-capture Handler lehnt alle non-text content_types pauschal ab (`@/Users/msc/subsumio-web/server/src/core/minions/handlers/ingest-capture.ts:97-108`). Das bedeutet: PDFs, DOCX, Images, Audio, Video aus Connectors (Google Drive, Dropbox, Inbox-Folder) werden **nicht ingestiert**, obwohl die Connectoren sie korrekt herunterladen.
- ⚠️ **Untrusted-Payload-Flag wird propagiert aber nicht enforced** — v1 vertraut dem Event-Shape, Content wird als user-authored markdown behandelt (`@/Users/msc/subsumio-web/server/src/core/minions/handlers/ingest-capture.ts:81-84`)
- ⚠️ **Kein Content-Type-Processor-Registry** — der Handler verweist auf "processor skillpacks" die nicht existieren

### 3.2 Frontend-Backend-Seam

**Design-Pattern:** Next.js API Routes als Proxy mit Auth, Quota, Rate-Limit → GBrain Engine

**Stärken:**
- ✅ **Multi-Tenant-Isolation** via `x-subsumio-source` Header (brainId) — Browser kann Tenant nie selbst wählen (`@/Users/msc/subsumio-web/src/lib/engine.ts:75`)
- ✅ **Org-Membership-Switching** — Team-Mitglieder nutzen Org-Brain + Owner-Plan (`@/Users/msc/subsumio-web/src/lib/engine.ts:66-73`)
- ✅ **Quota-Tracking** (`recordQuota` nach erfolgreichem Upload)
- ✅ **Rate-Limiting** via `RateTier` (standard, heavy)
- ✅ **Audit-Logging** für alle schreibenden Aktionen
- ✅ **API-Key-Auth** zwischen Next.js und Engine (`x-subsumio-api-key`)

**Schwächen:**
- 🔴 **DocuSign-Webhook umgeht Tenant-Isolation** — nutzt `SIGMABRAIN_BRAIN || "default"` statt Session-basiertem brainId
- ⚠️ **Error-Handling ist oberflächlich** — Engine-Errors werden als 503 "Service unavailable" durchgereicht, ohne Detail-Unterscheidung

### 3.3 Connector-Architecture

**Stärken:**
- ✅ **13 Connector-Klassen** (Gmail, Google Drive, Calendar, Dropbox, Notion, GitHub, Slack, Asana, Jira, beA, LegalJudgements, EurLex, SwissJudgements)
- ✅ **Einheitliche BaseConnector-Abstraktion** mit Token-Refresh, Delta-Sync, Rate-Limiting, Backoff, Health-Check
- ✅ **CONNECTOR_REGISTRY** für dynamische Instanziierung
- ✅ **State-Persistenz** in `~/.gbrain/connectors/` (JSON pro Connector)
- ✅ **OAuth2-PKCE-Flow** für Google-Services

**Schwächen:**
- ⚠️ **Frontmatter-Injection-Risiko** bei Notion und GitHub — Frontmatter wird als Plain-String gebaut (kein `js-yaml`), was bei Titeln mit `:`, `"`, oder `\n` zu korruptem YAML führt
- ⚠️ **Keine Connector-Health-Dashboard** im Frontend (nur API-Endpoint)
- ⚠️ **Keine automatische Token-Refresh-Prüfung** — Token-Expiry wird nur bei `fetchDelta`-Aufruf erkannt

---

## 4. Gap-Analyse

### 4.1 Kritische Gaps (P0 — Blocker für Kanzlei-Einsatz)

| # | Gap | Impact | betroffene Dateien |
|---|---|---|---|
| G1 | **Binary Content Gap im ingest-capture** — PDF/DOCX/Image/Audio aus Connectors werden abgelehnt | Google Drive, Dropbox, Inbox-Folder liefern Binary-Inhalt, der nie den Brain erreicht | `server/src/core/minions/handlers/ingest-capture.ts:97-108` |
| G2 | **E-Mail-Attachment-Extraktion fehlt** — Gmail + EML + beA erkennen Attachments, extrahieren sie aber nicht | Kritische Dokumente (Klagen, Urteile, Verträge) in E-Mail-Attachments gehen verloren | `server/src/core/ingestion/connectors/gmail.ts`, `server/src/core/extract-document.ts:261-263`, `server/src/core/ingestion/connectors/bea-import.ts` |
| G3 | **DocuSign Multi-Tenant-Isolation broken** — Webhook nutzt `default` brain statt Tenant-Routing | Cross-Tenant-Data-Leak bei Multi-Tenant-Deployments | `src/app/api/docusign/webhook/route.ts:73` |
| G4 | **WhatsApp Media → Brain-Pipeline fehlt** — Media wird gespeichert, aber nicht als Brain-Page persistiert | WhatsApp-Dokumente von Mandanten verschwinden im Storage, nicht im Brain | `src/app/api/whatsapp/webhook/route.ts`, `src/lib/whatsapp/media.ts` |
| G5 | **DocuSign HMAC-Verification optional** — ohne `DOCUSIGN_CONNECT_SECRET` wird Webhook unauthentifiziert akzeptiert | Webhook-Spoofing möglich → falsche Signing-Status in Brain-Pages | `src/app/api/docusign/webhook/route.ts:47-48` |

### 4.2 Hohe Gaps (P1 — Sollte vor Go-Live behoben werden)

| # | Gap | Impact |
|---|---|---|
| G6 | **E-Mail-Import: Body auf 2000 Zeichen trunciert** — Vollständige E-Mail-Inhalte gehen verloren | `src/app/api/email-import/route.ts:82` |
| G7 | **E-Mail-Import: Keine eigene Brain-Page** — nur Frontmatter-Patch auf Case-Page | E-Mails sind nicht durchsuchbar, nur als Metadaten-Anhang |
| G8 | **Frontmatter-Injection bei Notion + GitHub** — Plain-String-YAML statt `js-yaml` | Korruptes YAML bei Sonderzeichen im Titel |
| G9 | **Word-Add-In: Hardcoded URL, kein Upload** | Kanzlei kann nicht aus Word in Brain schreiben |
| G10 | **Mobile: Keine nativen Features implementiert** | Push, Biometrie, Share-Extension fehlen |
| G11 | **Keine PDF/A-Validierung** | Langzeitarchivierung nicht gewährleistet |
| G12 | **In-Memory-Idempotency bei WhatsApp + DocuSign** — funktioniert nicht bei Multi-Instance | Duplicate-Processing bei Last-Balancing |

### 4.3 Niedrige Gaps (P2 — Nice-to-Have)

| # | Gap | Impact |
|---|---|---|
| G13 | Notion: Keine Block-Pagination (>100 Blocks) | Lange Notion-Pages werden truncated |
| G14 | Slack: Keine Thread-Replies | Kontext von Diskussionen geht verloren |
| G15 | GitHub: Keine Discussions | Nur Issues/PRs, keine Discussions |
| G16 | Jira: Keine Pagination | Große Jira-Instanzen werden truncated |
| G17 | Asana: Keine Comment-Extraktion | Task-Kommentare fehlen |
| G18 | File-Watcher: Keine Delete-Events | Gelöschte Brain-Pages werden nicht synchronisiert |
| G19 | Audio: Keine automatische Löschung nach Transkription | DSGVO-Relevant |
| G20 | Keine Speaker-Diarization bei Audio | Wer hat was gesagt? |

---

## 5. Security-Audit

### 5.1 untrusted_payload-Handling

- ✅ `IngestionEvent.untrusted_payload` Flag ist definiert und wird im ingest-capture Handler propagiert
- ⚠️ **Flag wird nicht enforced** — Content wird als user-authored markdown behandelt, auto-link wird bypassed, aber Content-Sanity-Checks laufen (`assessContentSanity`, `runGuardrails`)
- ⚠️ v2-Plan: Routing durch `put_page` mit `OperationContext` + Trust-Tag → noch nicht implementiert

### 5.2 OAuth-Token-Storage

- ✅ Tokens gespeichert in `~/.gbrain/connectors/<service>.json` mit `0600`-Berechtigungen (via `BaseConnector.saveState`)
- ✅ Google OAuth2 nutzt PKCE (kein `client_secret` in der Auth-URL)
- ⚠️ **Token-Dateien sind unverschlüsselt** — bei File-System-Access sind Tokens im Klartext lesbar
- ⚠️ **Kein Token-Rotation-Mechanismus** — Tokens verfallen nur bei API-Error

### 5.3 Multi-Tenant-Isolation

- ✅ Next.js → Engine: `x-subsumio-source` Header wird server-side gesetzt, Browser kann ihn nicht wählen
- ✅ Org-Membership-Switching: Team-Mitglieder nutzen Org-Brain
- 🔴 **DocuSign-Webhook umgeht Isolation** — nutzt `process.env.SIGMABRAIN_BRAIN || "default"` (`@/Users/msc/subsumio-web/src/app/api/docusign/webhook/route.ts:73`)
- ⚠️ **WhatsApp-Webhook hat keine Tenant-Resolution** — `resolveSender` mappt Phone → User, aber Brain-Id wird nicht an Engine weitergegeben

### 5.4 Virus-Scan

- ✅ 3-Schicht-Defense: Magic-Bytes → Executable-Detection → ClamAV (optional)
- ✅ MIME-Mismatch-Erkennung für PDF, PNG, JPEG, TIFF
- ✅ Executable-Signatures: PE/EXE, ELF, Mach-O, Java Class
- ✅ ClamAV INSTREAM-Protokoll mit 10s-Timeout
- ⚠️ **ClamAV ist optional** — wenn `CLAMAV_HOST` nicht gesetzt, läuft nur Magic-Byte-Check
- ⚠️ **Keine Viren-Signatur-Updates** — ClamAV muss extern gepflegt werden

### 5.5 SQL-Injection / XSS

- ✅ Parameterized Queries via PGLite/Postgres Engine
- ✅ Filename-Sanitization (`[^a-zA-Z0-9._-]` → `_`) (`@/Users/msc/subsumio-web/src/lib/upload-validation.ts:37-43`)
- ✅ HTML-Escaping im Word-Add-In (`@/Users/msc/subsumio-web/word-addin/src/taskpane.ts:74-76`)
- ✅ `js-yaml` für Frontmatter-Serialisierung bei Legal-Connectoren (schutz gegen YAML-Injection)
- 🔴 **Frontmatter-Injection bei Notion + GitHub** — Plain-String-YAML, keine Escaping
- ⚠️ **E-Mail-Import: From/Subject werden ungefiltert in Brain-Frontmatter geschrieben** — potenzielle XSS via Markdown-Rendering

### 5.6 SSRF-Protection

- ✅ `ssrf-validate.test.ts` existiert (Test-Coverage)
- ✅ Webhook-URLs werden nicht user-konfigurierbar akzeptiert (Connector-URLs sind hardcodiert)

### 5.7 Symlink-Attacks

- ✅ File-Watcher: `followSymlinks: false` (hardcoded)
- ✅ Inbox-Folder: `followSymlinks: false` + per-file `lstat`-Check bei Emit (`@/Users/msc/subsumio-web/server/src/core/ingestion/sources/inbox-folder.ts:168-178`)
- ✅ Upload-Path-Validation: `validateUploadPath` mit sandbox-confinement (`@/Users/msc/subsumio-web/server/test/file-upload-security.test.ts`)

---

## 6. Test-Audit

### 6.1 Server-Side Tests (Bun:test)

| Bereich | Test-Datei | Coverage |
|---|---|---|
| IngestionDaemon | `server/test/ingestion/daemon.test.ts` (514 lines) | ✅ Supervision, Dispatch, Dedup, Rate-Limit, Backoff |
| IngestionEvent Types | `server/test/ingestion/types.test.ts` | ✅ Validation, Content-Hash |
| ingest-capture Handler | `server/test/ingestion/ingest-capture.test.ts` (197 lines) | ✅ Slug-Resolution, Binary-Rejection, Validation |
| Connectoren | `server/test/ingestion/connectors.test.ts` (813 lines) | ✅ BaseConnector, ConnectorManager, Google OAuth, Mock-Sync |
| Dedup | `server/test/ingestion/dedup.test.ts` | ✅ Content-Hash-Dedup |
| Document Extraction | `server/test/extract-document.test.ts` (257 lines) | ✅ PDF, DOCX, EML, CSV, XLSX, OCR-Fallback |
| File Upload Security | `server/test/file-upload-security.test.ts` (208 lines) | ✅ Path-Traversal, Symlink, Sandbox-Confinement |
| beA-Connector | `server/test/bea-import-connector.test.ts` | ✅ XML-Parsing, Namespace, CDATA |
| Legal Judgements | `server/test/legal-judgements-connector.test.ts` | ✅ RIS-OGD, OpenLegalData |
| Import-File | `server/test/import-file.test.ts` (23824 bytes) | ✅ Full import pipeline |
| Transcription | `server/test/transcription.test.ts` | ✅ Audio-Transkription |

### 6.2 Frontend-Side Tests (Playwright E2E)

| Test | Coverage |
|---|---|
| `tests/e2e-playwright/upload-flow.spec.ts` | ✅ Upload-Flow |
| `tests/e2e-playwright/auth-flow.spec.ts` | ✅ Auth-Flow |
| `tests/e2e-playwright/search-flow.spec.ts` | ✅ Search-Flow |
| `tests/e2e-playwright/kanzlei-flow.spec.ts` | ✅ Kanzlei-OS-Flow |
| `tests/e2e-playwright/a11y.spec.ts` | ✅ Accessibility |
| `tests/e2e-playwright/accessibility.spec.ts` | ✅ Additional A11y |

### 6.3 Fehlende Tests

| Bereich | Status |
|---|---|
| WhatsApp-Webhook | 🔴 Keine Tests |
| DocuSign-Webhook | 🔴 Keine Tests |
| E-Mail-Import | 🔴 Keine Tests |
| Word-Add-In | 🔴 Keine Tests |
| Mobile/Capacitor | 🔴 Keine Tests |
| Notion-Connector | 🔴 Keine Tests |
| GitHub-Connector | 🔴 Keine Tests |
| Slack-Connector | 🔴 Keine Tests (nur im connectors.test.ts als Mock) |
| Asana-Connector | 🔴 Keine Tests |
| Jira-Connector | 🔴 Keine Tests |
| SwissJudgements-Connector | 🔴 Keine Tests |
| EurLex-Connector | 🔴 Keine Tests |
| Calendar-Connector | 🔴 Keine Tests (nur im connectors.test.ts als Mock) |
| Virus-Scan (ClamAV) | 🔴 Keine Tests |
| Frontmatter-Injection | 🔴 Keine Tests für Notion/GitHub |

---

## 7. Edge-Case-Simulation

| Szenario | Verhalten | Bewertung |
|---|---|---|
| **Leere Datei (0 Bytes)** | `extractDocumentText` → leerer Text → `importFromContent` mit leerem Body → Brain-Page mit nur Frontmatter | ✅ Handled |
| **Große PDF (50MB)** | `MAX_DOCUMENT_FILE_SIZE = 50MB` → Extraktion läuft, Text fließt durch `MAX_FILE_SIZE` Guard in importFromContent | ✅ Handled |
| **Abgelaufene OAuth-Tokens** | `BaseConnector.fetchDelta` → 401 → `refreshToken()` → Retry mit neuem Token | ✅ Handled |
| **Rate-Limit überschritten** | Token-Bucket im Daemon blockiert Event → Source wird gedrosselt | ✅ Handled |
| **Concurrent Uploads** | Next.js Rate-Limiting (`heavy` Tier) + Engine-side Quota | ✅ Handled |
| **Korrupte DOCX** | `mammoth.extractRawText` → Error → Warning in `warnings[]`, leerer Text | ✅ Handled (non-fatal) |
| **Gescannte PDF ohne Text** | `PDF_SPARSE_TEXT_CHARS_PER_PAGE = 32` → OCR-Fallback via pdf2pic + Vision-Model → Unverified-Banner | ✅ Handled (wenn Dependencies installiert) |
| **OCR-Dependencies fehlen** | `tryOcrFallback` → `import('pdf2pic')` catch → return `''` → Warning mit Install-Hint | ✅ Graceful degradation |
| **Symlink im Inbox-Folder** | `lstat` → `isSymbolicLink()` → reject + warn | ✅ Handled |
| **World-writable Inbox-Dir** | `statSync` → `mode & 0o002` → warn mit `chmod 700` Hint | ✅ Handled |
| **inotify-ENOSPC (Linux)** | chokidar error handler → `msg.includes('ENOSPC')` → sysctl-Hint | ✅ Handled |
| **Source-Crash-Loop** | `SourceSupervisor` → `maxCrashes: 10` → exponential Backoff → `stableRunResetMs: 5min` | ✅ Handled |
| **JQL-Injection in Jira** | JQL wird aus User-Filtern gebaut, aber Filter-Werte werden nicht escaped | ⚠️ Potenzielles Risiko |
| **YAML-Injection (Notion/GitHub)** | Titel mit `:\n` im Frontmatter → korruptes YAML | 🔴 Bestätigte Vulnerability |
| **WhatsApp Webhook Replay** | In-Memory-Idempotency mit 30min TTL → nach TTL wird Replay akzeptiert | ⚠️ Risiko bei Redelivery >30min |
| **DocuSign Webhook ohne HMAC** | Wenn `DOCUSIGN_CONNECT_SECRET` nicht gesetzt → Webhook wird unauthentifiziert akzeptiert | 🔴 Kritisch |

---

## 8. Priorisierte Action-Items

### P0 — Kritisch (vor Go-Live behoben)

| # | Action | Aufwand | betroffene Dateien |
|---|---|---|---|
| A1 | **Binary Content Processor im ingest-capture Handler implementieren** — PDF/DOCX/Image/Audio via `extractDocumentText` extrahieren, statt abzulehnen | 2-3 Tage | `server/src/core/minions/handlers/ingest-capture.ts` |
| A2 | **E-Mail-Attachment-Extraktion implementieren** — Gmail: Attachment via API herunterladen + extrahieren; EML: MIME-Multipart parsen; beA: Attachment-Dateien verarbeiten | 3-5 Tage | `server/src/core/ingestion/connectors/gmail.ts`, `server/src/core/extract-document.ts`, `server/src/core/ingestion/connectors/bea-import.ts` |
| A3 | **DocuSign Multi-Tenant-Isolation fixen** — Webhook muss Envelope → Tenant → brainId auflösen (DB-Lookup oder Envelope-Metadata) | 1-2 Tage | `src/app/api/docusign/webhook/route.ts` |
| A4 | **WhatsApp Media → Brain-Pipeline aufbauen** — Media-Datei via `extractDocumentText` extrahieren → Brain-Page erstellen | 2-3 Tage | `src/app/api/whatsapp/webhook/route.ts`, `src/lib/whatsapp/media.ts` |
| A5 | **DocuSign HMAC-Verification required machen** — Webhook muss 401 zurückgeben, wenn `DOCUSIGN_CONNECT_SECRET` nicht gesetzt | 0.5 Tage | `src/app/api/docusign/webhook/route.ts` |

### P1 — Hoch (innerhalb 2 Wochen nach Go-Live)

| # | Action | Aufwand |
|---|---|---|
| A6 | E-Mail-Import: Body-Truncation entfernen + eigene Brain-Page erstellen | 1-2 Tage |
| A7 | Frontmatter-Injection bei Notion + GitHub fixen (js-yaml verwenden) | 0.5 Tage |
| A8 | Word-Add-In: Configurable URL + Upload-Funktion | 2-3 Tage |
| A9 | Mobile: Share-Extension + Push implementieren | 5-7 Tage |
| A10 | Idempotency auf Redis/DB umstellen (WhatsApp + DocuSign) | 1-2 Tage |
| A11 | Tests für WhatsApp/DocuSign/E-Mail-Import/Webhook-Handler schreiben | 3-5 Tage |

### P2 — Niedrig (Backlog)

| # | Action | Aufwand |
|---|---|---|
| A12 | Notion Block-Pagination implementieren | 0.5 Tage |
| A13 | Slack Thread-Replies extrahieren | 1 Tag |
| A14 | Jira Pagination implementieren | 0.5 Tage |
| A15 | Audio: Automatische Löschung nach Transkription (DSGVO) | 0.5 Tage |
| A16 | PDF/A-Validierung für Langzeitarchivierung | 1-2 Tage |
| A17 | Connector-Health-Dashboard im Frontend | 2-3 Tage |
| A18 | Token-Verschlüsselung bei Storage | 1-2 Tage |

---

## 9. Test-Plan

### 9.1 Neue Unit-Tests (P0)

```
server/test/ingestion/binary-content-processor.test.ts
  → Test: PDF via ingest-capture → Brain-Page mit extrahiertem Text
  → Test: DOCX via ingest-capture → Brain-Page
  → Test: Image via ingest-capture → Brain-Page mit OCR
  → Test: Audio via ingest-capture → Brain-Page mit Transkription
  → Test: Binary ohne Processor → aussagekräftiger Error

server/test/ingestion/email-attachment-extraction.test.ts
  → Test: Gmail mit PDF-Attachment → Brain-Page für Attachment
  → Test: EML mit DOCX-Attachment → Brain-Page für Attachment
  → Test: beA mit Attachment → Brain-Page für Attachment
  → Test: Attachment ohne unterstützten Typ → Warning

src/app/api/docusign/webhook.test.ts
  → Test: HMAC-Verification required (401 ohne Secret)
  → Test: Multi-Tenant-Routing (Envelope → brainId)
  → Test: Idempotency bei Replay
  → Test: Status-Mapping (completed/declined/voided)

src/app/api/whatsapp/webhook.test.ts
  → Test: Signature-Verification
  → Test: Text-Message → Brain-Page
  → Test: Media-Message → Download + Brain-Page
  → Test: Idempotency bei Replay
  → Test: Sender-Not-Allowed → 200 + ignored

src/app/api/email-import.test.ts
  → Test: Case-Matching via Aktenzeichen
  → Test: Case-Matching via Client-Email
  → Test: Duplicate-Detection
  → Test: Full-Body-Import (keine Truncation)
  → Test: Eigene Brain-Page für E-Mail
```

### 9.2 Neue E2E-Tests (P1)

```
tests/e2e-playwright/connector-flow.spec.ts
  → Test: Connector-Liste im Dashboard
  → Test: Connector-Sync triggern
  → Test: Connector-Enable/Disable

tests/e2e-playwright/whatsapp-flow.spec.ts
  → Test: WhatsApp-Webhook mit Text-Message
  → Test: WhatsApp-Webhook mit Media-Message

tests/e2e-playwright/docusign-flow.spec.ts
  → Test: DocuSign-Webhook mit completed-Status
  → Test: DocuSign-Webhook mit declined-Status
```

### 9.3 Regression-Tests

```
server/test/ingestion/frontmatter-injection.test.ts
  → Test: Notion-Titel mit ":" → gültiges YAML
  → Test: GitHub-Titel mit "\n" → gültiges YAML
  → Test: Jira-Titel mit '"' → gültiges YAML
```

---

## 10. Definition of Done

Der Subsumio Brain Engine ist **produktionsreif für Kanzleien**, wenn:

- [ ] **A1** Binary Content Processor implementiert (PDF/DOCX/Image/Audio aus Connectors → Brain-Page)
- [ ] **A2** E-Mail-Attachment-Extraktion für Gmail, EML, beA implementiert
- [ ] **A3** DocuSign Multi-Tenant-Isolation korrigiert
- [ ] **A4** WhatsApp Media → Brain-Pipeline aufgebaut
- [ ] **A5** DocuSign HMAC-Verification required
- [ ] **A6** E-Mail-Import: Full-Body + eigene Brain-Page
- [ ] **A7** Frontmatter-Injection bei Notion + GitHub fixen
- [ ] **A10** Idempotency auf Redis/DB umgestellt
- [ ] **A11** Tests für alle Webhook-Handler geschrieben
- [ ] Alle P0-Tests grün
- [ ] Edge-Case-Simulation für alle Kanäle durchgeführt
- [ ] Security-Audit von externer Stelle bestätigt

---

*Ende des Audit-Reports*
