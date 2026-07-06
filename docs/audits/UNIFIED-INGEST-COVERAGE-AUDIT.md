# Unified Ingest Coverage Audit

Status: **migration blocked — coverage gate not yet satisfied**  
Scope: SaaS document ingestion, semantic indexing, legal analysis, and Copilot readiness.

## Canonical invariant

Every external document must enter one durable ingest session and progress through the same
versioned state machine. Transport adapters may differ, but they must not extract, deduplicate,
index, trigger legal analysis, or declare readiness independently.

`created → uploading → uploaded → verifying → clean|quarantined → dedup_resolved → extracting → extracted|partial → chunking → embedding → indexed → analyzing → copilot_ready`

Terminal failure states retain the original, error code, attempt count, and last successful stage.

## Current entry-point matrix

| Entry point              | Current path                                              |                    Binary-safe |              Durable retry |                        Legal pipeline |              Copilot gate | Migration disposition                                         |
| ------------------------ | --------------------------------------------------------- | -----------------------------: | -------------------------: | ------------------------------------: | ------------------------: | ------------------------------------------------------------- |
| Dashboard upload         | `api.upload.file` → presign/multipart or direct fallback  |                            Yes |                    Partial |                  Yes, plus web outbox |                        No | Keep UI; replace orchestration with ingest session            |
| Chat attachment          | Dashboard upload with `source=chat`                       |                            Yes |                    Partial |             Standalone synthetic case |                        No | Same session; wait for `copilot_ready`; retrieve parts        |
| Portal upload            | Separate buffered Next route → engine `/api/upload`       |                            Yes |                Outbox only |                                   Yes |                        No | Thin authenticated adapter into canonical session             |
| Offline sync             | `use-mutation` → `api.upload.file`                        |                            Yes |            IndexedDB retry |                     Same as dashboard |                        No | Preserve transport retry; canonical server session            |
| Act import               | `api.upload.file(defer_pipeline=true)` + finalize trigger |                            Yes |                    Partial |                        Deferred batch |                        No | Session group/barrier; one case analysis after all indexed    |
| Onboarding               | `api.upload.file(source=wiki)`                            |                            Yes |                    Partial |            Currently upload semantics |                        No | Canonical session with knowledge policy                       |
| Word add-in              | Canonical `/api/upload` text document                     |                      Text only |      Upload retry contract |                                   Yes | Indexed by canonical path | Migrated                                                      |
| Mobile share             | Documented, not implemented                               |                    No evidence |                         No |                                    No |                        No | Implement only against canonical adapter                      |
| beA/ERV                  | Special handling inside two engine upload handlers        |                            Yes |                      Mixed | Direct trigger plus post-upload tasks |                        No | Parser policy inside canonical extraction stage               |
| Connector daemon         | `IngestionEvent` → shared upload extraction               | Supported documents and images | Queue retry + backpressure |                                   Yes | Indexed by canonical path | Binary path migrated; readiness event pending                 |
| Advokat import           | Connector with direct file persistence plus event         |                          Mixed |                      Mixed |                    Via ingest capture |                        No | Remove direct persistence after session adapter exists        |
| Webhook ingestion        | Direct `ingest_capture` queue job                         |                      Text only |                Queue retry |                           Conditional |                        No | Canonical event adapter; enforce untrusted-content policy     |
| File watcher/inbox       | Daemon → `ingest_capture`                                 |  Text only for current handler |         Source supervision |                           Conditional |                        No | Canonical adapter; never silently drop                        |
| CLI/filesystem sync      | `importFromFile` / `importFromContent`                    |                    Yes locally |              Command retry |                      No SaaS contract |                       N/A | Keep as administrative import, or explicitly opt into session |
| Law corpus/evals/reindex | Direct import APIs                                        |                Domain/internal |           Command-specific |                      Intentionally no |                       N/A | Out of customer-ingest scope; document exemption              |

## Confirmed blockers

### B1 — duplicate identity is modeled at the wrong level

`files` has a unique storage path but only a non-unique content-hash index. The presigned path
deduplicates by `(source_id, content_hash)`, while the web duplicate store is case-scoped. The
same bytes can therefore be rejected across legitimate matters, and concurrent confirms are not
atomically serialized.

Required model:

- `content_blobs(source_id, sha256)` unique and immutable;
- `documents(document_id, blob_id, case_slug, logical_version)`;
- optional uniqueness on `(source_id, case_slug, blob_id, active)`;
- transactionally create-or-link instead of check-then-insert.

### B2 — asynchronous readiness is not enforced

Large uploads return a processing stub. Dashboard and chat treat non-failed responses as done.
Chat then injects at most 8,000 characters from the parent page. Split documents and processing
stubs are therefore not reliably consumable.

Required: only `copilot_ready` attachments may be submitted; retrieval operates on all indexed
parts and returns page/chunk provenance plus extraction coverage.

### B3 — OCR completeness is advisory

Sparse-page OCR defaults to 100 pages. Partial OCR is represented as warnings and may still
reach ready/indexed status. Required: page-level jobs, persisted coverage, explicit `partial`, and
a policy-controlled readiness threshold.

### B4 — connector binary ingestion (resolved in migration)

Trusted connector file paths now pass security inspection, durable original persistence, shared
extraction/OCR, chunking, embedding, and legal analysis. Untrusted binary path payloads fail
closed. Unsupported video remains outside the supported document-format contract.

### B5 — daemon backpressure (resolved in migration)

Rate limits now delay rather than drop. Dispatcher failures retry with bounded exponential delay
until the durable Minion queue accepts the event or the daemon shuts down.

### B6 — recovery schedules are incomplete

`upload-reconcile` and `upload-multipart-cleanup` routes exist but are absent from `vercel.json`.
They are therefore not guaranteed to execute in the Vercel deployment represented by this repo.

### B7 — post-processing has multiple owners

Upload handlers can trigger `legal-pipeline`, persist engine post-upload task pages, call back to
the web app, and enqueue the web outbox. Other entry points trigger the legal pipeline directly.
There is no single idempotency key covering analysis ownership and pipeline version.

### B8 — split publication is not atomic

Parts are imported sequentially and become searchable before the parent is published. A failed
late part can leave a partially visible document. Required: generation IDs and an atomic active
generation switch after every part and embedding has succeeded.

### B9 — trust and scope policies are inconsistent

Upload paths propagate source, matter scope, and ACL groups. `ingest_capture` records
`untrusted_payload` but explicitly does not enforce it, and direct text-page writers bypass the
same ingest policy. Canonical session creation must fail closed on tenant, matter, ACL, and trust.

## Single-owner target

Only the engine-side `DocumentIngestOrchestrator` owns stage transitions. Next.js, portal,
Copilot, Word, mobile, and connectors are adapters. The orchestrator writes a transactional
outbox event for each committed transition. Workers consume events idempotently using
`(ingest_session_id, stage, pipeline_version)`.

The legal multilayer pipeline is a downstream stage, not an upload side effect. Its single key is
`(case_slug, document_generation_set_hash, legal_pipeline_version)`. Repeated callbacks return the
existing job rather than creating another analysis.

## Deletion gate

No old runtime path may be removed until all conditions pass:

1. Every customer-facing entry point has a row in the matrix and a canonical adapter test.
2. Tenant, matter, ACL, and trust isolation tests fail closed at every transition.
3. Concurrent identical uploads produce one blob and the correct number of document links.
4. Crash injection after every stage resumes without duplicate chunks or analysis jobs.
5. A 500+ page digital PDF and a 500+ page scanned PDF finish with measured page coverage.
6. Mixed text/scan PDFs retain page provenance and report OCR confidence/coverage.
7. Split generations remain invisible until all chunks and embeddings are committed.
8. Copilot refuses processing/partial documents unless the user explicitly accepts the risk.
9. Portal, chat, act import, offline replay, connector, beA, and Word paths produce equivalent
   canonical metadata for the same fixture.
10. Queue saturation delays work without dropping an accepted event.
11. Reconciliation, multipart cleanup, DLQ alerting, and analysis retry schedules are deployed.
12. Shadow-mode output meets or exceeds the old pipeline on the golden corpus.

## Required executable test suites

- `ingest-entrypoint-contract`: adapter → identical session policy and metadata.
- `ingest-dedup-race`: 20 concurrent confirms, same and different matters.
- `ingest-stage-crash-matrix`: terminate worker after every committed transition.
- `ingest-tenant-boundary`: forged source, matter, ACL, upload token, and job payloads.
- `ingest-large-pdf`: digital, scan-only, mixed, encrypted, corrupt, annotated, and oversized.
- `ingest-generation-atomicity`: no partial search visibility.
- `ingest-copilot-readiness`: no stub/parent truncation; citations resolve to page and chunk.
- `ingest-backpressure`: accepted events are never dropped under queue saturation.
- `ingest-shadow-parity`: old/new extraction, chunks, retrieval, and legal outputs.

## Files eligible for deletion only after migration

- `src/lib/presigned-upload.ts` after confirming no external package imports it;
- brain hash system-page duplicate store after blob/document migration;
- orchestration branches in Next upload and portal routes;
- direct legal-pipeline triggers from upload, beA, ingest-capture, and finalize routes;
- one of the engine/web post-upload outboxes after the transactional outbox owns all stages.

The routes themselves may remain as compatibility adapters until clients have migrated.
