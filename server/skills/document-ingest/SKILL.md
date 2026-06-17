---
name: document-ingest
version: 1.0.0
description: |
  Ingest PDF, DOCX, Word, E-Mail (.eml/.msg), Excel, and CSV documents into the
  brain with text extraction, OCR fallback for scanned PDFs, auto-classification,
  and domain-specific entity extraction (deadlines, amounts, legal references).
  The universal document pipeline for all verticals (Legal, Tax, Medical, etc.).
triggers:
  - "ingest this document"
  - "process this PDF"
  - "process this Word document"
  - "ingest this contract"
  - "ingest this invoice"
  - "ingest this email"
  - "scanned PDF"
  - "OCR this document"
  - "upload and process"
  - "document to brain"
  - "bulk ingest documents"
  - "import these files"
tools:
  - search
  - query
  - get_page
  - put_page
  - add_link
  - add_timeline_entry
  - file_upload
mutating: true
writes_pages: true
writes_to:
  - documents/
  - people/
  - companies/
  - concepts/
---

# document-ingest — Universal Document Pipeline

> **Convention:** see [conventions/quality.md](../conventions/quality.md) for
> citation rules, back-link enforcement, and exact-phrasing requirements.
>
> **Convention:** see [_brain-filing-rules.md](../_brain-filing-rules.md) for
> the filing decision protocol.

## Iron Law

Every document ingested becomes a brain page. The **document page is the source
of truth**; the original file is preserved for provenance but the brain page is
what the graph, search, and synthesis layers operate on.

- Every person, company, and entity mentioned gets back-linked.
- Every deadline, amount, or legal reference gets extracted and typed.
- Scanned PDFs are OCR'd; no document is left behind.

## Supported Formats

| Format | Extension | Extraction Method | OCR Fallback |
|--------|-----------|-------------------|--------------|
| **PDF (text-based)** | `.pdf` | `unpdf` text extraction | N/A |
| **PDF (scanned)** | `.pdf` | `unpdf` (sparse text detected) → `pdf2pic` → vision OCR | GPT-4o-mini |
| **Word Document** | `.docx`, `.doc` | `mammoth` raw text extraction | N/A |
| **E-Mail** | `.eml`, `.msg` | `postal-mime` parsing + threading | N/A |
| **Excel Spreadsheet** | `.xlsx`, `.xls` | `xlsx` → CSV per sheet | N/A |
| **CSV/TSV** | `.csv`, `.tsv` | Direct text import | N/A |

## When to invoke

The user uploads or references a document file (PDF, DOCX, E-Mail, Excel, CSV)
and wants it ingested into the brain. This skill supersedes the generic
`media-ingest` for document-specific ingestion, offering:

- OCR for scanned PDFs
- Auto-classification (contract, invoice, letter, court filing, etc.)
- Domain entity extraction (deadlines, amounts, legal references, ICD codes)
- Bulk/multi-document processing

## The Pipeline

```
1. UPLOAD       → gbrain files upload-raw <file> --page <slug>
                  (original preserved for provenance)

2. EXTRACT      → extractDocumentText() via src/core/extract-document.ts
                  PDF → unpdf, DOCX → mammoth, EML → postal-mime, etc.

3. OCR-FALLBACK → If PDF text layer is sparse (< 32 chars/page):
                  pdf2pic (page-by-page rasterization) → maybeOcr() → GPT-4o-mini
                  → extracted text merged with native text layer

4. CLASSIFY     → LLM auto-classifies document type:
                  contract | invoice | letter | court_filing | medical_record
                  | tax_document | email_thread | report | other

5. EXTRACT      → Domain-specific entity extraction based on classification:
                  - Legal: deadlines, case_numbers, court, parties, legal_refs
                  - Tax: invoice_number, amount, tax_id, due_date, vendor
                  - Medical: patient_id, diagnosis_codes, medications, dates
                  - Generic: people, companies, amounts, dates, key_terms

6. WRITE        → Create brain page with extracted text + structured frontmatter
                  + auto-classified type + extracted entities section

7. CROSS-LINK   → For every extracted entity (person, company, deadline,
                  case, concept), create/update brain page and add back-link
```

## Phase 1: Upload and Extract

### Single Document

```bash
# 1. Upload raw file for provenance
UPLOADED=$(gbrain files upload-raw "$FILE" --page "documents/$(basename "$FILE" .pdf)")

# 2. Extract text (handled by gbrain sync / import-file.ts for synced sources)
#    Or manually via gbrain put-page with extracted content
```

### Bulk Documents

```bash
# Process multiple documents in a directory
for f in ~/Documents/to-ingest/*.{pdf,docx,eml,xlsx,csv}; do
  [ -f "$f" ] || continue
  SLUG="documents/$(date +%Y-%m-%d)-$(basename "$f" | sed 's/[^a-zA-Z0-9]/-/g')"
  gbrain files upload-raw "$f" --page "$SLUG"
  # Extraction happens automatically on next sync, or trigger manually:
  gbrain sync --source documents-uploaded
done
```

## Phase 2: OCR Fallback for Scanned PDFs

When `extractDocumentText()` returns `pdf_text_layer_sparse` warning:

**Automatic OCR fallback is now built in.** When `extractDocumentText()` detects a
sparse text layer (`pdf_text_layer_sparse` warning), the pipeline automatically:

1. Rasterizes PDF pages to PNG images (via `pdf2pic` + `pdftoppm` from Poppler)
2. Runs vision OCR (GPT-4o-mini) on each page
3. Combines extracted text with `--- Page N ---` separators
4. Returns the OCR text as the document body

No manual intervention required. The only prerequisite is `pdftoppm`:
- **macOS:** `brew install poppler`
- **Linux:** `apt-get install poppler-utils`
- **Windows:** `choco install poppler` or use WSL

> **Note:** The vision OCR call respects `GBRAIN_EMBEDDING_IMAGE_OCR=true`. Without
> this env var or an available expansion model, the fallback is skipped and the
> `pdf_text_layer_sparse` warning remains. The model is explicitly instructed NOT to
> follow embedded instructions in images (prompt-injection mitigation).

## Phase 3: Auto-Classification

After text extraction, classify the document. This drives the extraction strategy
in Phase 4.

```
LLM Classification Prompt (one-shot, 200 tokens max):
"Classify this document into ONE of: contract, invoice, letter, court_filing,
medical_record, tax_document, email_thread, report, other.

Also extract: language (de/en/fr), confidentiality (public/internal/confidential),
page_count_estimate, key_topic (2-3 words)."
```

Classification is stored in frontmatter:
```yaml
---
title: "Klageerwiderung Muster GmbH"
type: document
document_type: court_filing
language: de
confidentiality: confidential
source_format: pdf
pages: 12
extracted_date: 2026-06-11
---
```

## Phase 4: Domain Entity Extraction

Based on `document_type`, apply the appropriate extraction strategy.

### Legal Documents (`document_type: court_filing | contract | letter`)

Extract and type:

| Entity | Type | Example |
|--------|------|---------|
| **Parties** | `LegalActor` | Kläger, Beklagte, Vertreter |
| **Court** | `Court` | LG München I, 21 O 1234/26 |
| **Case Number** | `CaseReference` | 21 O 1234/26 |
| **Deadlines** | `LegalDeadline` | Klageerwiderungsfrist: 14 Tage ab Zustellung |
| **Legal References** | `LegalReference` | § 433 BGB, § 335 ZPO |
| **Amounts** | `MonetaryAmount` | Schadensersatz: 50.000 EUR |
| **Dates** | `EventDate` | Zustelldatum, Verhandlungstermin |

Deadline extraction uses jurisdiction-aware rules:
- **Germany:** § 187 BGB (Fristbeginn), § 193 BGB (Fristende bei Sonn-/Feiertag)
- **Austria:** § 904 ABGB (Verjährung), § 1154 ABGB (Fristen)
- Holidays: automatic exclusion from federal/state holiday databases

### Tax Documents (`document_type: tax_document | invoice`)

| Entity | Type | Example |
|--------|------|---------|
| **Invoice Number** | `InvoiceNumber` | RE-2026-0042 |
| **Vendor** | `Company` | Muster GmbH |
| **Amount Net** | `MonetaryAmount` | 1.000,00 EUR |
| **Tax Amount** | `MonetaryAmount` | 190,00 EUR |
| **Tax Rate** | `TaxRate` | 19% MwSt |
| **Due Date** | `TaxDeadline` | Zahlungsziel: 14 Tage |
| **Tax ID** | `TaxIdentifier` | DE123456789 |

### Medical Documents (`document_type: medical_record`)

| Entity | Type | Example |
|--------|------|---------|
| **Patient ID** | `PatientIdentifier` | (anonymized) |
| **ICD Codes** | `ICDCode` | ICD-10: J18.9 |
| **Medications** | `Medication` | Amoxicillin 500mg |
| **Diagnosis Date** | `EventDate` | 2026-06-01 |
| **Physician** | `Person` | Dr. Müller |
| **Facility** | `Company` | Klinikum München |

### Generic Documents

| Entity | Type |
|--------|------|
| **People** | `Person` |
| **Companies** | `Company` |
| **Concepts** | `Concept` |
| **Amounts** | `MonetaryAmount` |
| **Dates** | `EventDate` |
| **Key Terms** | `Concept` |

## Phase 5: Brain Page Format

```markdown
---
title: "{extracted title or filename}"
type: document
document_type: {auto-classified type}
language: {de/en/fr/etc}
confidentiality: {public/internal/confidential}
source_format: {pdf/docx/eml/xlsx/csv}
pages: {N}
extracted_date: {YYYY-MM-DD}
source_file: {uploaded file hash or path}
---

# {Title}

**Source:** {original filename or email subject}
**Format:** {pdf/docx/eml/etc}
**Classified as:** {document_type}
**Extracted:** {date}

## Summary

{3-5 sentence summary of the document's purpose and key points}

## Full Text

{extracted document text — paginated or sectioned if long}

## Extracted Entities

### People
- [{Name}](people/{slug}.md) — {role in document}

### Companies / Organizations
- [{Name}](companies/{slug}.md) — {role in document}

### Deadlines / Dates
- **YYYY-MM-DD** | {description} | {legal basis if applicable}

### Amounts
- {amount} {currency} — {context}

### Legal References
- {reference} — {context}

### Key Terms / Concepts
- [{Term}](concepts/{slug}.md)

## Document Timeline

- **YYYY-MM-DD** | {event}: {description}
```

## Phase 6: Entity Propagation

For every extracted entity:

1. **Check brain** for existing page (`gbrain get people/{slug}`)
2. **Create/enrich** if needed (delegate to `skills/enrich/SKILL.md`)
3. **Add back-link** from entity page to this document page
4. **Add timeline entry** on entity page referencing this document

A document is NOT fully ingested until entity propagation is complete.

## Filing Rules

Documents are filed under `documents/` by default. Sub-directories based on classification:

| Classification | Directory |
|----------------|-----------|
| contract | `documents/contracts/` |
| invoice | `documents/invoices/` |
| court_filing | `documents/legal/court-filings/` |
| letter | `documents/correspondence/` |
| email_thread | `documents/correspondence/emails/` |
| medical_record | `documents/medical/` |
| tax_document | `documents/tax/` |
| report | `documents/reports/` |
| other | `documents/uncategorized/` |

> **Convention:** The primary directory is by document TYPE, not by date or source.
> Date prefixes (`YYYY-MM-DD-`) are used when multiple documents of the same type
> exist for the same entity.

## Output Format

Report to user:
```
Ingested {filename}: {N} pages, {M} entities detected ({X} people, {Y} companies,
{Z} deadlines), classified as {document_type}. Brain page: documents/{slug}
```

If OCR was required:
```
Ingested {filename}: PDF had no text layer — OCR'd {N} pages, extracted {M} chars.
Classified as {document_type}. Brain page: documents/{slug}
```

## Anti-Patterns

- ❌ Skipping scanned PDFs because OCR is "too slow" — every document matters
- ❌ Filing by date instead of by type — `documents/2026/` is a dumping ground
- ❌ Extracting text without classification — extraction quality depends on type context
- ❌ Creating stub pages without full text — the brain page must contain the content
- ❌ Missing back-links for extracted entities — an unlinked entity is a broken graph
- ❌ Ignoring warnings from `extractDocumentText()` — sparse text layer means OCR needed

## Related Skills

- `skills/media-ingest/SKILL.md` — for video, audio, books, screenshots, repos
- `skills/voice-note-ingest/SKILL.md` — for voice memos and audio notes
- `skills/enrich/SKILL.md` — for entity page creation and enrichment
- `skills/meeting-ingestion/SKILL.md` — for meeting transcripts
- `skills/capture/SKILL.md` — for quick thoughts and ideas

## Contract

This skill guarantees:
- Every supported document format is extractable (PDF, DOCX, EML, XLSX, CSV, TSV)
- Scanned PDFs are OCR'd, not silently skipped
- Every document gets auto-classified
- Domain-specific entities are extracted based on classification
- Every entity mention creates a back-link
- Raw source files are preserved via `gbrain files upload-raw`
- Filing follows type-based directory structure

The full behavior contract is documented in the body sections above; this section
exists for the conformance test.
