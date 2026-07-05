# Canonical document ingestion

There is exactly one supported raw-document ingestion path:

`POST /api/upload` → `runExtractionAndImport` → document extraction/OCR →
chunking/embeddings → Brain persistence → legal pipeline.

The Next.js route `src/app/api/upload/route.ts` is the authenticated web proxy.
The engine implementation and source of truth are in
`server/src/commands/web-api.ts` and `server/src/core/extract-document.ts`.

## Acceptance testing a complete act

Use `bun run akte:e2e -- ...`. The runner uploads original files through
`/api/upload`; it must never upload prepared OCR text through `/api/pages`.
It defers per-document analysis, waits for every extraction, triggers one
case-level pipeline over all resulting pages, then reads every declared output
page back from the Brain and writes a JSON report.

Required environment variables:

- `SUBSUMIO_WEB_API_KEY`
- `SUBSUMIO_BRAIN_ID`
- `SUBSUMIO_ENGINE_URL` (optional; local engine by default)

Example:

```sh
bun run akte:e2e -- \
  --dir "/absolute/path/to/raw-act" \
  --case-slug legal/cases/acceptance-2026-001 \
  --title "Acceptance 2026-001" \
  --jurisdiction at \
  --verfahrenstyp straf
```

Old case-specific scripts which inserted preprocessed OCR text directly as
pages were removed. Such scripts bypass extraction and cannot prove ingestion
quality.

The Toni ground-truth suite under `tests/` remains useful as an OCR/output
regression benchmark, but is explicitly not an ingestion E2E test. The former
`legal-pipeline-e2e-toni-gericht` simulation and duplicate server-side copies
were removed to prevent that distinction from being lost again.
