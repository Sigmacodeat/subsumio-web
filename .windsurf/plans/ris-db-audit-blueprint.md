# RIS DB Audit Blueprint

## Ziel
Vollständiger Audit der österreichischen RIS-Gesetze: Abfrage aller RIS OGD API Endpoints, Erfassung aller Metadaten-Felder pro Gesetz, und 1:1-Abgleich mit lokalem Corpus + DB-Schema.

## Phase 1: RIS API Full Query
- **Endpoint**: `https://data.bka.gv.at/ris/api/v2.6/Bundesrecht?Applikation=BrKons`
- Paginate through ALL pages (100 per page)
- For every `OgdDocumentReference`: capture full `Metadaten.Bundesrecht` block
- Fields to capture per law:
  - `Gesetzesnummer`, `Kurztitel`, `Titel`, `Langtitel`
  - `BrKons.Typ` (G=Gesetz, V=Verordnung)
  - `BrKons.Kundmachungsorgan`, `BrKons.Dokumenttyp`
  - `BrKons.ArtikelParagraphAnlage`, `BrKons.Paragraphnummer`
  - `BrKons.StammnormPublikationsorgan`, `BrKons.StammnormBgblnummer`
  - `BrKons.NovellenPublikationsorgan`, `BrKons.NovellenBgblnummer`
  - `BrKons.NovellenBeziehung`
  - `BrKons.Inkrafttretensdatum`, `BrKons.Ausserkrafttretensdatum`
  - `BrKons.Indizes`
  - `BrKons.Schlagworte`
  - `BrKons.Aenderung`
  - `BrKons.AlteDokumentnummer`
  - `BrKons.GesamteRechtsvorschriftUrl`
  - `Eli`
  - `DokumentUrl` (from Metadaten.Allgemein)
- Group by Gesetzesnummer (multiple norms per law)
- Output: JSON file with all laws + metadata

## Phase 2: Local Corpus Audit
- Scan `law-corpus/at/*.md`
- Parse frontmatter from each file
- Extract: `title`, `abbreviation`, `version_date`, `source_url`, `gesetzesnummer` (if present)
- Count files, sizes, content quality (min length, § presence)

## Phase 3: Gap Analysis
- Compare RIS Gesetzesnummern → corpus files with matching `gesetzesnummer`
- Compare RIS Kurztitel → corpus filenames (slugified)
- Identify:
  1. **Missing laws**: In RIS but not in corpus
  2. **Orphan files**: In corpus but not in RIS (deleted/außer Kraft)
  3. **Metadata gaps**: Corpus files without `gesetzesnummer` in frontmatter
  4. **Version staleness**: Compare `version_date` in corpus vs RIS `Inkrafttretensdatum`
  5. **Typ coverage**: Ensure we have both Gesetze (G) and Verordnungen (V) if desired

## Phase 4: DB Schema Audit
- Compare RIS API metadata fields → DB schema columns
- Check if all RIS fields can be stored in:
  - `pages.frontmatter` (JSONB — flexible)
  - `content_chunks` metadata columns
  - `legal_source_versions` table
- Identify RIS fields with no DB mapping

## Phase 5: Report Generation
- Output: `/tmp/ris-audit-report.json`
- Summary stats: total RIS laws, total corpus files, match rate, missing count
- Detailed lists: missing laws, orphan files, metadata gaps, stale versions
- Schema mapping table: RIS field → DB column → status

## Implementation
- Script: `server/scripts/ris-db-audit.ts`
- Runs with: `bun run server/scripts/ris-db-audit.ts`
- No DB connection needed (compares API → files only)
- Rate-limited (300ms between API pages)
- Output to stdout + `/tmp/ris-audit-report.json`
