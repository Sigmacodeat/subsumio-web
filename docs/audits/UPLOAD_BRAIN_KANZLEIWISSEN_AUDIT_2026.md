# Upload → Brain → Kanzleiwissen Pipeline Audit

**Datum:** 2026-06-21  
**Scope:** Dokumenten-Upload, Brain-Ingestion, Tenant-Isolation, Kanzleiwissen-Import, Gesetzes-/Judikatur-Corpus  
**Status:** Kritische Review + Gap-Analyse + konkrete Maßnahmen

---

## 1. Executive Summary

### Was funktioniert bereits gut

- **Tenant-Isolation ist architektonisch korrekt** — jede Page/Chunke/Link/Tabelle ist `source_id`-scoped. Der Engine legt ein UNIQUE auf `(source_id, slug)` und die Retrieval-SQL filtert `p.source_id = ANY(...)` innerhalb der inneren CTE. Das ist State-of-the-Art für den Pool-Pattern.
- **Upload-Pipeline hat solide Sicherheitsgürtel**: MIME-Whitelist, Größenlimit, Dateinamen-Sanitisierung, SHA-256-Duplikat-Check, ClamAV-/Magic-Byte-Scan.
- **DACH-Legal-Corpus ist eingebunden**: 21+ deutsche/österreichische/schweizerische Gesetze, lokal in `law-corpus/`, mit Version-Stamping, Lizenz-Attribution und einer `/api/legal/statute`-Schnittstelle.
- **Judikatur-APIs sind registriert**: RIS-OGD AT, OpenLegalData DE, OpenCaseLaw CH, EUR-Lex EuGH (via `src/lib/source-registry.ts`).
- **Suche/thinking federiert Tenant-Source + Shared Read Sources**: `GBRAIN_SHARED_READ_SOURCES=law-at,law-de` ermöglicht, dass jede Kanzlei ihre eigenen Akten und die öffentlichen Gesetze gleichzeitig abfragt, ohne dass Tenant-Daten kreuzen.
- **Content-Sanity-Gate** (Quarantäne, Oversize, Junk-Pattern) und **provenance write-through** (`source_kind`, `source_uri`, `ingested_via`) sind vorhanden.

### Was noch nicht perfekt ist

1. **Kein dedizierter „Kanzleiwissen“-Source-Typ.** Heute landen Uploads je nach `source`-Feld in `documents/`, `legal_case/`, `wiki/` etc. Es gibt keine administrative Quelle, die explizit „dieses PDF ist Kanzleiwissen“ kennzeichnet und es von Akten-Dokumenten unterscheidet.
2. **Judikatur-APIs sind nur registriert, nicht automatisch in den Brain importiert.** Der `source-registry.ts` weiß von ihnen, aber ein aktiver, regelmäßiger Ingest in den Brain ist nicht sichtbar.
3. **Upload ist synchron (bis zu 50 MB).** Große Aktenordner oder DMS-Syncs können nicht asynchron in Bulk verarbeitet werden. Harvey & CoCounsel haben hier längst asynchrone Workflows/Temporal.
4. **Keine DMS-Integration.** iManage, NetDocuments, SharePoint, Google Drive, OneDrive werden nicht automatisch synchronisiert.
5. **Keine Document-Level RBAC innerhalb einer Kanzlei.** Innerhalb eines `source_id` sieht jeder berechtigte Nutzer alle Pages. „Ethical walls“ / Matter-Scope existieren nur als experimenteller Signed-Token-Filter (P0-SECR-002), nicht als allgemeines ACL-Modell.
6. **Matter-Scope ist nicht vollständig durchgesetzt.** Nur `/api/search` und `/api/think` filtern danach. `/api/legal/*`-Analyse, `/api/pages`, Uploads selbst etc. haben keine Matter-Scope-Isolation.
7. **Keine explizite „Kanzleiwissen hochladen“-UI.** Im Dashboard gibt es einen generischen Upload, aber keine dedizierte „Wissensmanagement“-Oberfläche mit Kategorien, Playbooks, Templates.
8. **Kein automatisches „Kanzleiwissen speist sich aus dem Brain“** — zwar kann das System über alle Pages suchen, aber es gibt keinen aktiven, automatischen Synchronisations-Job, der z. B. erfolgreiche Vertragsklauseln, Urteile oder Memo-Highlights in eine Kanzleiwissen-Quelle überführt.

### Gesamtbeurteilung

Die Architektur ist **fundamental korrekt und produktionsreif für den Single-Tenant/Small-Firm-Fall**. Um im Wettbewerb mit Harvey, Clio, CoCounsel und Leya zu bestehen, fehlt vor allem **Enterprise-Scale** (asynchrone Bulk-Ingestion, DMS-Connectoren, Document-Level ACLs) und **ein explizites Kanzleiwissen-Produkt** (verwaltbare Wissensquelle, Playbooks, auto-curated Precedents). Die größten kurzfristigen Risiken sind **keine automatische Judikatur-Synchronisation**, **keine Matter-ACLs** und **keine DMS-Anbindung**.

---

## 2. Blueprint: Ziel, Flows, Datenmodell, Architektur

### 2.1 Ziel aus User-Sicht

> Jede Kanzlei kann sicher ihre eigenen Dokumente, Gesetze, Urteile, Playbooks und Erfahrungen in ein isoliertes Brain importieren. Das System erkennt automatisch, was zu „Kanzleiwissen“ wird, und ermöglicht explizites Wissensmanagement. Alle Daten sind mandanten-isoliert, DSGVO-konform, versioniert und zitierfähig.

### 2.2 Kern-Userflows

| Flow                                 | Beschreibung                                                  | Status                                                |
| ------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------- |
| **Einzeldokument-Upload**            | PDF/DOCX/JPG in Akte oder Kanzleiwissen                       | ✅ implementiert                                      |
| **Bulk-Upload / Ordner-Upload**      | Drag & Drop ganzer Ordner                                     | ⚠️ nur 50 MB synchron, kein asynchroner Bulk          |
| **DMS-Sync**                         | iManage/NetDocuments/SharePoint/Google Drive                  | ❌ nicht implementiert                                |
| **Automatische Gesetzes-Updates**    | täglich/weekly neue Gesetzesfassungen                         | ⚠️ Script vorhanden, aber kein automatischer Sync-Job |
| **Automatische Judikatur-Updates**   | RIS-OGD/OpenLegalData/OpenCaseLaw                             | ⚠️ APIs registriert, kein automatischer Ingest        |
| **Explizites Kanzleiwissen-Upload**  | Playbooks, Templates, FAQs, Precedents                        | ❌ nur generischer Upload, keine Kanzleiwissen-Source |
| **Kanzleiwissen aus Brain ableiten** | Erfolgreiche Klauseln, Urteile, Memo-Highlights auto-curieren | ❌ nicht automatisiert                                |
| **Matter-ACL / Ethical Walls**       | nur bestimmte Anwälte dürfen bestimmte Akten sehen            | ⚠️ experimentell (Signed Token)                       |

### 2.3 Datenmodell

```
Tenant (Org) → source_id (brain_id / org_id)
  ├── source: documents       → pages: documents/*
  ├── source: legal_case      → pages: cases/*
  ├── source: wiki            → pages: wiki/*
  ├── source: kanzleiwissen   → pages: kanzleiwissen/*   (NEU, fehlt)
  ├── source: law-de          → shared read-only (GBRAIN_SHARED_READ_SOURCES)
  ├── source: law-at          → shared read-only
  └── source: law-ch          → shared read-only
```

Jede Page ist eine Zeile in `pages (source_id, slug)`. Chunks und Embeddings sind per `page_id` referenziert und über den Join auf `pages` automatisch `source_id`-gefiltert.

### 2.4 Architektur-Entscheidungen

| Entscheidung                     | Bewertung                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Pool-Pattern mit `source_id`** | ✅ korrekt für Multi-Tenant; günstiger als Index-per-Tenant                                                   |
| **Postgres + pgvector**          | ✅ gut für kleine/mittlere Kanzleien; bei > 1 Mio Chunks ggf. HNSW-Recalls oder horizontale Skalierung prüfen |
| **Synchrone Ingestion**          | ⚠️ okay für Einzeluploads, aber nicht für Bulk/DMS                                                            |
| **Keine Document-Level ACLs**    | ⚠️ reicht für kleine Kanzleien, nicht für Enterprise                                                          |
| **Federated Read Sources**       | ✅ exzellent für Gesetzes-Integration                                                                         |
| **Provenance-Tracking**          | ✅ `source_kind`, `source_uri`, `ingested_via`                                                                |

### 2.5 Edge-Cases & Fehlerszenarien

- **Gleicher Dateiname, andere Akte:** Slug ist `source/filename`, daher Überschreiben bei gleicher Source. Für Akten-Dokumente müsste der Slug die `case_slug` enthalten oder Versionierung greifen.
- **Virus-Scan fehlt/ClamAV offline:** Pipeline wirft Fehler, Upload bricht ab. Kein Fallback-Modus.
- **Embedding-Provider nicht konfiguriert:** Upload landet, aber nicht embedded. Suche nur keyword-basiert.
- **Tenant-Header fehlt:** In SaaS-Modus (`GBRAIN_REQUIRE_TENANT=true`) wird 400 zurückgegeben. In Self-Host-Modus fällt auf `default` zurück.
- **Shared Source misconfigured:** Wenn `GBRAIN_SHARED_READ_SOURCES` falsch gesetzt ist, fehlen Gesetze in der Suche.
- **Großes PDF mit OCR:** 50 MB-Limit kann bei hochauflösenden Scans schnell erreicht sein.

### 2.6 Definition of Done (Zielzustand)

- [ ] Jede Kanzlei hat eine eigene `source_id`.
- [ ] Alle Uploads landen in der richtigen Source und sind isoliert.
- [ ] Gesetze und Urteile sind automatisch aktuell und als Shared Read Sources verfügbar.
- [ ] Es gibt eine dedizierte Kanzleiwissen-Source mit eigener UI.
- [ ] DMS-Integrationen synchronisieren asynchron und respektieren ACLs.
- [ ] Matter-ACLs/Ethical Walls sind mandantenweit und endpoint-übergreifend.
- [ ] Uploads skalieren auf 100.000+ Dokumente pro Mandant.
- [ ] Jedes Zitat ist mit Gesetzes-Version und Fundstelle groundet.

---

## 3. Code-Analyse

### 3.1 Upload-Pfad (Next.js → Engine)

```
User → POST /api/upload
  → src/app/api/upload/route.ts
    → createHandler (Auth, RBAC, Rate-Limit, Quota)
    → scanUpload (validate, sanitize, SHA-256, ClamAV)
    → validateCaseSlug (falls legal source)
    → POST /api/upload (Engine)
  → server/src/commands/web-api.ts
    → parseMultipart
    → tenantSource = requestSourceId(req)  // x-sigmabrain-source
    → buildMarkdownFromUpload (PDF/DOCX OCR, Bild-OCR, JSON)
    → importFromContent(engine, slug, markdown, { sourceId: tenantSource, ... })
    → case_slug stamping + tagging
```

**Stärken:**

- `scanUpload` ist zentral und wird auch von WhatsApp genutzt (`src/lib/whatsapp/media.ts`).
- `case_slug`-Validierung und `case_slug`-Stamping für GoBD-/BRAO-Compliance.
- Provenance-Write-Through: `source_kind: "web_upload"`, `source_uri: "sigmabrain-upload:{slug}"`.

**Schwächen:**

- `validateCaseSlug` ruft `/api/pages/{slug}` mit `x-subsumio-brain-id` auf, nicht mit `x-sigmabrain-source`. Das ist inkonsistent und kann bei Multi-Source-Brains zu falschen Ergebnissen führen.
- `scanUpload` berechnet SHA-256, nutzt es aber nicht für echte Duplikat-Erkennung (nur `scanUploadWithDuplicateCheck` würde das, wird aber im Route nicht verwendet).
- Großer Upload-Buffer wird zweimal im Speicher gehalten (Next.js + Engine).

### 3.2 Brain-Ingestion (`importFromContent`)

`server/src/core/import-file.ts:227-311` → zentrale Ingestion-Funktion:

- Content-Size-Guard (MAX_FILE_SIZE)
- Markdown-Parsing
- Quarantäne-/Content-Flag-Marker-Stripping bei untrusted remote callers
- Content-Sanity-Assessment
- Stable Hash (exkl. ephemeral keys)
- Duplikat-Erkennung (`findDuplicatePage`)
- Chunking (recursive + fenced code)
- Embedding via `embedBatch` (Contextual Retrieval title-tier inline)
- DB-Transaktion mit `sourceId`
- Tag-Reconciliation (add-only)
- Link-Extraktion (doc↔code)
- Alias-Projection

**Stärken:**

- Sehr ausgereift: Hash-Stabilität, Quarantäne, Content-Flag, Contextual Retrieval, Provenance.
- `sourceId` wird durchgängig in `tx.putPage`, `tx.upsertChunks`, `tx.addTag`, `tx.addLink` verwendet.
- `forceRechunk` für Re-Index nach Chunker-Updates.

**Schwächen:**

- Keine Unterstützung für „Upload in Kanzleiwissen-Source“ — `source` wird nur für den Slug-Präfix genutzt, nicht als `source_id`.
- Keine Bulk-Import-API für große Ordner.
- Keine automatische Klassifikation nach Upload (z. B. „ist das ein Vertrag, ein Urteil, ein Schriftsatz?“).

### 3.3 Isolation

**Tenant-Isolation:**

- `requestSourceId` liest `x-sigmabrain-source` und validiert gegen `SOURCE_RE`.
- `engineContext()` in `src/lib/engine.ts` setzt `x-subsumio-source` auf die `brainId` der Organisation.
- `PostgresEngine.getPage/putPage/listPages/searchKeyword/searchVector` filtern `source_id` in SQL.
- `GBRAIN_REQUIRE_TENANT=true` verhindert Fallback auf `default`.

**Matter-Isolation:**

- `parseMatterScopeToken` / `verifiedMatterScope` mit HMAC-SHA256-Signatur.
- Angewendet in `/api/search` und `/api/think`.
- **Nicht** angewendet in `/api/upload`, `/api/pages`, `/api/legal/*`, `/api/temporal/*`, `/api/connector-coverage/*`.

**Shared Read Sources:**

- `GBRAIN_SHARED_READ_SOURCES=law-at,law-de` föderiert öffentliche Gesetze in Suche/Think.
- Schreiben bleibt auf den Tenant-Source beschränkt.

**Risiko:** Der Matter-Scope ist ein Proof-of-Concept, kein allgemeines ACL-System. Für Enterprise-Kanzleien reicht das nicht.

### 3.4 Embedding-Pipeline

- `embedBatch` / `embedQuery` in `server/src/core/embedding.ts`.
- `server/src/commands/embed.ts` → `runEmbedCore` für stale Chunks.
- Contextual Retrieval: title-tier inline, per-chunk-synopsis via Minion-Backfill.
- Embedding-Signature-Stamping für Modell-/Dimensio-Änderungen.
- Batching + Concurrency in `server/src/core/embed-stale.ts`.

**Stärken:**

- Provider-agnostisch (AI Gateway).
- Embedding-Signature für Stale-Erkennung.
- Contextual Retrieval ist State-of-the-Art.

**Schwächen:**

- Keine dedizierte „Kanzleiwissen-Re-Index“-Strategie (z. B. wichtige Playbooks mit besseren Embeddings).

### 3.5 Gesetze / Judikatur

| Komponente                              | Status                                    |
| --------------------------------------- | ----------------------------------------- |
| Lokales Gesetzes-Corpus (`law-corpus/`) | ✅ DE/AT/CH/EU                            |
| `ingest-law-corpus.ts`                  | ✅ Download-Script                        |
| `/api/legal/statute`                    | ✅ paragraph-basierte Suche               |
| `source-registry.ts`                    | ✅ API-Registrierung                      |
| Auto-Sync Gesetze                       | ❌ kein Cron/Job                          |
| Auto-Sync Judikatur                     | ❌ kein Cron/Job                          |
| Ingest in Brain als `law-de`/`law-at`   | ⚠️ dokumentiert, aber nicht automatisiert |

---

## 4. Competitive Intelligence

### 4.1 Harvey

- **Firm Knowledge / Vault**: DMS-Integrationen (iManage, SharePoint, Google Drive), Ordner-Upload, One-Way-Sync.
- **Asynchrone Ingestion**: Temporal als Orchestrator, 100.000+ Dateien, Worker-Queues, Rate-Limiting, Diff-Algorithmus.
- **VectorDB**: LanceDB Enterprise für Private-Cloud-Deployments, Postgres+pgvector für kleinere Projekte.
- **Isolation**: Vault-Projekte, Ethical Walls, DMS-ACL-Mirroring.
- **Lernpotenzial für uns**: Asynchrone Bulk-Ingestion, DMS-Connectoren, Rate-Limiting, Diff-Algorithmus, Vault-ähnliche Projekte.

### 4.2 Clio / Manage AI

- **DMS-Integrationen**: NetDocuments, SharePoint, OneDrive, Google Drive (neu für Clio Work).
- **Sicherheit**: Daten werden nicht für Modell-Training genutzt, regionsspezifische Verarbeitung, RBAC basierend auf Clio-Manage-Berechtigungen.
- **Mandanten-Isolation**: logische Daten-Trennung, rollenbasierte Zugriffssteuerung.
- **Lernpotenzial**: ACL-Mirroring aus dem Practice-Management-System, regionale Datenresidenz.

### 4.3 Thomson Reuters CoCounsel

- **Knowledge Search**: gleichzeitige Suche über Westlaw, Practical Law, DMS (iManage, NetDocuments, SharePoint), HighQ, OneDrive.
- **Sicherheit**: ISO/IEC 42001, AES-256, TLS 1.2, zero-retention API calls, keine Trainingsnutzung.
- **Integration**: Microsoft 365, DMS, HighQ.
- **Lernpotenzial**: Multi-Repository-Föderation, vertrauenswürdige dritte Inhalte, Enterprise-Zertifizierungen.

### 4.4 Leya / Legora

- **DMS-Sync**: Direkte Anbindung an DMS, Playbooks, Templates, externe Rechtsquellen.
- **15+ Jurisdiktionen**, sentence-level citations.
- **Sicherheit**: GDPR, ISO 27001, SOC 2.
- **Lernpotenzial**: Einfache DMS-Anbindung, Playbooks, Fokus auf EU/DACH.

### 4.5 Noxtua

- **Europäische souveräne KI**, BSI C5, ISO 42001, ISO 27001, ISO 9001.
- Fokus auf Datenresidenz und Compliance.
- **Lernpotenzial**: DACH-/EU-Sovereignty-Positionierung, Zertifizierungen.

### 4.6 Zusammenfassung: Wettbewerbslücken

| Thema                      | Harvey         | Clio | CoCounsel  | Leya   | Subsumio   |
| -------------------------- | -------------- | ---- | ---------- | ------ | ---------- |
| DMS-Sync                   | ✅             | ✅   | ✅         | ✅     | ❌         |
| Async Bulk Ingestion       | ✅             | ⚠️   | ✅         | ✅     | ❌         |
| Matter-ACL / Ethical Walls | ✅             | ✅   | ✅         | ⚠️     | ⚠️         |
| Document-Level RBAC        | ✅             | ✅   | ✅         | ⚠️     | ❌         |
| Kanzleiwissen-Source       | ✅ Vault       | ⚠️   | ✅         | ✅     | ❌         |
| Auto-Update Gesetze        | ✅             | ⚠️   | ✅         | ✅     | ⚠️         |
| Auto-Update Judikatur      | ✅             | ❌   | ✅         | ✅     | ⚠️         |
| Self-Hosted / Open Source  | ❌             | ❌   | ❌         | ❌     | ✅         |
| DACH-Fokus                 | ❌             | ⚠️   | ⚠️         | ✅     | ✅         |
| Preis                      | ~1.200 $/Monat | SaaS | Enterprise | Custom | 79 €/Monat |

**Fazit:** Subsumio hat die beste Architektur für Self-Hosted/DACH-Preis, aber fehlt bei Enterprise-Features (DMS-Sync, Bulk, ACLs). Genau dort müssen wir aufholen, um den Wettbewerbsvorteil „erschwinglich + souverän“ zu verstärken.

---

## 5. Gap-Analyse + Konkrete Risiken

### 5.1 Kritische Risiken (P0)

| #   | Risiko                                                                    | Auswirkung                                                                                              | Nachweis                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **~~Keine automatische Gesetzes-/Judikatur-Synchronisation~~**            | ~~Brain arbeitet mit veralteten Gesetzen; Zitate können falsch sein.~~                                  | **BEHOBEN** während des Audits: Engine-Endpoint `/api/admin/law-sync` + Cron `/api/cron/law-sync` um 03:00; Rechtsprechungs-Endpoint `/api/legal/judgements-sync` + Cron `/api/cron/judgements-sync` um 03:30.                                             |
| R2  | **~~Matter-Scope nur in Search/Think~~**                                  | ~~Anwalt A kann Anwalt Bs Akte über `/api/legal/analyze`, `/api/pages` oder Upload-Response sehen.~~    | **BEHOBEN** während des Audits: Globaler Middleware-Handler `matterScopeMiddleware` in `server/src/commands/web-api.ts`; `req.matterScope` wird an alle `invokeOp`-Aufrufe, `runThink` und slug-basierte Legal/Temporal/Connector-Endpunkte durchgereicht. |
| R3  | **Keine Document-Level ACLs**                                             | Interne Kanzlei-Daten sind für alle Teammitglieder sichtbar.                                            | Keine Tabelle für Page-ACLs, keine Gruppen/Rollen außer globaler RBAC.                                                                                                                                                                                     |
| R4  | **~~Source-Header-Mismatch: Engine ignorierte `x-subsumio-source`~~**     | ~~Im SaaS-Modus landen alle Tenant-Requests im `default`-Source → Mandantenisolation bricht zusammen.~~ | **BEHOBEN** während des Audits: `server/src/commands/web-api.ts` liest jetzt `x-subsumio-source` bevorzugt und `x-sigmabrain-source` als Fallback.                                                                                                         |
| R5  | **~~Upload-Route verwendet inkonsistenten Header für Case-Validierung~~** | ~~Falsche Akte kann akzeptiert oder richtige Akte abgelehnt werden.~~                                   | **BEHOBEN** während des Audits: `src/app/api/upload/route.ts` nutzt jetzt `ctx.headers`.                                                                                                                                                                   |
| R6  | **Synchroner Upload für große Dateien/Ordner**                            | Timeout, schlechte UX, Memory-Druck.                                                                    | `express.raw({ limit: "50mb" })` und kein asynchroner Bulk-Endpoint.                                                                                                                                                                                       |
| R7  | **Keine DMS-Integration**                                                 | Kanzleien müssen manuell exportieren/importieren; Wissen wird nicht aktuell gehalten.                   | Keine Connector-Implementierung für iManage/NetDocuments/SharePoint/GDrive.                                                                                                                                                                                |

### 5.2 Mittlere Risiken (P1)

| #   | Risiko                                                   | Auswirkung                                                                                              | Nachweis                                                                                                                                   |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| R8  | **~~Keine dedizierte Kanzleiwissen-Source~~**            | ~~Playbooks, Templates, Precedents sind nicht von Akten-Dokumenten getrennt; Suche vermischt Kontext.~~ | **BEHOBEN** während des Audits: `source: "kanzleiwissen"` im Upload-Route und UI; Default-Source im Upload-Dialog ist jetzt Kanzleiwissen. |
| R9  | **Keine automatische Kanzleiwissen-Ableitung**           | Erfolgreiche Arbeit wird nicht für zukünftige Fälle nutzbar gemacht.                                    | Kein Skill/Job, der z. B. aus abgeschlossenen Fällen erfolgreiche Klauseln extrahiert.                                                     |
| R10 | **~~SHA-256-Duplikat nicht im Upload-Route verwendet~~** | ~~Doppelte Dateien werden mehrfach gespeichert/embedded.~~                                              | **BEHOBEN** während des Audits: `src/app/api/upload/route.ts` nutzt `scanUploadWithDuplicateCheck` mit brain-basiertem `DuplicateStore`.   |
| R11 | **Keine automatische Klassifikation nach Upload**        | Dokumente werden nicht als Vertrag, Urteil, Schriftsatz, Rechnung etc. getaggt.                         | `inferInitialExtractionStatus` gibt Status, aber keine Type-Klassifikation.                                                                |
| R12 | **OCR-Qualität nicht verifiziert**                       | Bild-Uploads können unbrauchbare Ergebnisse liefern.                                                    | `ocrImageBuffer` setzt `extraction_unverified: true`, aber kein Confidence-Score.                                                          |
| R13 | **Kein Audit-Log pro Upload**                            | Wer hat wann was hochgeladen?                                                                           | `createHandler` loggt generisch, aber kein dediziertes Upload-Audit.                                                                       |

### 5.3 Geringe Risiken (P2)

- Keine Preview/Thumbnails für Uploads.
- Keine Upload-Progress-Anzeige für große Dateien.
- Keine Versionierung von Dokumenten (nur `pages` upsert).
- Keine automatische Sprachdetektion für OCR-Output.

---

## 6. Empfehlungen + Sofort-Maßnahmen

### 6.1 Sofort-Maßnahmen (1–2 Wochen)

| Maßnahme                                 | Aufwand | Risiko, das sie schließt | Implementierungsort                                                                                                     |
| ---------------------------------------- | ------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Fix Upload-Route Case-Validierung**    | XS      | R5                       | ✅ BEHOBEN: `src/app/api/upload/route.ts` nutzt jetzt `ctx.headers`.                                                    |
| **Duplikat-Check im Upload aktivieren**  | XS      | R10                      | ✅ BEHOBEN: `src/app/api/upload/route.ts` nutzt `scanUploadWithDuplicateCheck` mit `brainDuplicateStore`.               |
| **Upload-Quota-Record nach Erfolg**      | XS      | R13                      | ✅ BEHOBEN: `recordQuota` wird nach erfolgreichem Upload ausgeführt.                                                    |
| **Auto-Sync Gesetze + Judikatur (Cron)** | M       | R1                       | ✅ BEHOBEN: `/api/admin/law-sync` + `/api/cron/law-sync`; `/api/cron/judgements-sync` für `/api/legal/judgements-sync`. |
| **Kanzleiwissen-Source einführen**       | M       | R8                       | ✅ BEHOBEN: `source: "kanzleiwissen"` im Upload-Route und UI; Default ist jetzt Kanzleiwissen.                          |

### 6.2 Kurzfristige Maßnahmen (1–2 Monate)

| Maßnahme                                 | Aufwand | Risiko | Implementierungsort                                                                                                         |
| ---------------------------------------- | ------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Asynchrone Bulk-Upload-API**           | L       | R6, R7 | Temporal oder einfacher Background-Job-Queue mit `minion_jobs`; Endpoint `/api/upload/bulk`.                                |
| **DMS-Connector-Framework**              | L       | R7     | Adapter-Interface in `server/src/core/ingestion/connectors/`; erste Adapter für Google Drive / SharePoint.                  |
| **Matter-Scope endpoint-übergreifend**   | M       | R2     | ✅ BEHOBEN: `matterScopeMiddleware` + `req.matterScope` in allen `invokeOp`/`runThink`-Pfaden und slug-basierten Endpoints. |
| **Document-Level ACLs (Gruppen/Rollen)** | L       | R3     | Neue Tabelle `page_permissions`, `matter_groups`, `user_groups`; Filter in Search/Page-Reads.                               |
| **Kanzleiwissen auto-curieren**          | L       | R8     | Skill/Minion-Job, der aus abgeschlossenen Fällen/Verträgen Precedents in `kanzleiwissen/` überführt.                        |

### 6.3 Mittelfristige Maßnahmen (3–6 Monate)

| Maßnahme                                                       | Aufwand | Risiko                         |
| -------------------------------------------------------------- | ------- | ------------------------------ |
| **VectorDB-Evaluierung für Scale**                             | L       | Performance bei > 1 Mio Chunks |
| **Enterprise-Zertifizierungen (ISO 27001, ISO 42001, BSI C5)** | XL      | Wettbewerbsfähigkeit           |
| **Advanced DMS-Integrations** (iManage, NetDocuments)          | XL      | Enterprise-Adoption            |
| **Agentic DMS-Search** (ohne Pre-Ingestion)                    | XL      | Harvey-Konkurrenz              |
| **Multi-Region-Hosting / Datenresidenz**                       | XL      | EU-Kanzleien                   |

### 6.4 Minimal-Fix vs. Umbau

| Problem           | Minimal-Fix                    | Umbau                                             |
| ----------------- | ------------------------------ | ------------------------------------------------- |
| Case-Validierung  | Header korrigieren             | –                                                 |
| Duplikat-Check    | `scanUploadWithDuplicateCheck` | Globaler Content-Addressed-Store                  |
| Gesetze/Judikatur | Cron-Job                       | Vollständiges Source-Management mit Diff + Alerts |
| Bulk Upload       | 50 MB-Limit erhöhen            | Asynchrone Workflow-Engine                        |
| DMS               | Manueller Export/Import        | Connector-Framework + Sync                        |
| ACLs              | Matter-Scope erweitern         | Document-Level RBAC mit Gruppen                   |
| Kanzleiwissen     | Neue Source + UI               | Auto-Curation + Knowledge Graph                   |

---

## 7. Fazit

Die Subsumio-Upload-Brain-Pipeline ist **architektonisch korrekt und für den aktuellen Produktionsbetrieb geeignet**. Tenant-Isolation über `source_id`, federierte Gesetzes-Sources, Provenance-Tracking und Content-Sanity sind solide implementiert.

Die größten Unterschiede zu Harvey, Clio, CoCounsel und Leya liegen in:

1. **Skalierung der Ingestion** (asynchron, Bulk, DMS)
2. **Zugriffskontrolle innerhalb der Kanzlei** (Matter-Scope, ACLs, Ethical Walls)
3. **Explizites Kanzleiwissen-Management** (Source, UI, Auto-Curation)
4. **Automatische Aktualisierung externer Rechtsquellen** (Gesetze + Judikatur)

Die Empfehlung ist, die **Sofort-Maßnahmen in den nächsten 2 Wochen** umzusetzen, um die kritischen Risiken zu schließen, und dann die **Kurzfrist-Maßnahmen** in 1–2 Monaten zu priorisieren, um den Enterprise- und DACH-Wettbewerbsvorsprung zu sichern.

---

**Verifizierte Code-Referenzen:**

- `src/app/api/upload/route.ts:1-131`
- `server/src/commands/web-api.ts:1521-1662`
- `server/src/core/import-file.ts:227-899`
- `server/src/core/postgres-engine.ts:901-1944`
- `server/src/core/search/hybrid.ts:772-1099`
- `src/lib/engine.ts:88-110`
- `src/lib/source-registry.ts:1-200`
- `server/scripts/ingest-law-corpus.ts:1-300`
