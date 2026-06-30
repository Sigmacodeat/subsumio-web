import type { Pool } from "pg";
import { ensureLegalGraphSchema } from "./schema";

// ── Types ─────────────────────────────────────────────────────────────

export interface JudgementRecord {
  id: string;
  ecli: string | null;
  file_number: string | null;
  court: string;
  court_level: string | null;
  jurisdiction: string;
  decision_date: string | null;
  decision_type: string | null;
  legal_area: string | null;
  title: string;
  content: string;
  summary: string | null;
  keywords: string[];
  source: string;
  source_url: string | null;
  content_hash: string | null;
  language: string;
}

export interface ImportProgress {
  source: string;
  imported: number;
  skipped: number;
  errors: number;
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

// ── Court hierarchy classification ────────────────────────────────────

const COURT_LEVEL_MAP: Record<string, string> = {
  BGH: "supreme",
  BVERFG: "supreme",
  BVERWG: "supreme",
  BFH: "supreme",
  BAG: "supreme",
  BSG: "supreme",
  EUGH: "supreme",
  EGMR: "supreme",
  OLG: "appeals",
  OVG: "appeals",
  FG: "specialized",
  LAG: "specialized",
  LSG: "specialized",
  VG: "specialized",
  LG: "district",
  AG: "district",
  SG: "district",
  AMTSGERICHT: "district",
};

function classifyCourtLevel(court: string): string | null {
  const upper = court.toUpperCase().trim();
  for (const [key, level] of Object.entries(COURT_LEVEL_MAP)) {
    if (upper.includes(key)) return level;
  }
  return null;
}

// ── HTML stripping ────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Content hashing ───────────────────────────────────────────────────

function hashContent(text: string): string {
  let hash = 0;
  const str = text.slice(0, 10000);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `h${Math.abs(hash).toString(36)}`;
}

// ── OpenLegalData API client ──────────────────────────────────────────

const OPENLEGALDATA_BASE = "https://de.openlegaldata.io/api";

interface OpenLegalDataCase {
  id: number;
  slug?: string;
  ecli?: string;
  court?: { name?: string; code?: string };
  file_number?: string;
  date?: string;
  type?: string;
  content?: string;
  language?: string;
  keywords?: string[];
  citation_count?: number;
}

interface OpenLegalDataResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: OpenLegalDataCase[];
}

async function fetchCaseDetail(id: number): Promise<OpenLegalDataCase | null> {
  try {
    const res = await fetch(`${OPENLEGALDATA_BASE}/cases/${id}/`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as OpenLegalDataCase;
  } catch {
    return null;
  }
}

async function fetchCaseList(opts: {
  page?: number;
  pageSize?: number;
  dateAfter?: string;
  search?: string;
}): Promise<OpenLegalDataResponse> {
  const url = new URL(`${OPENLEGALDATA_BASE}/cases/`);
  url.searchParams.set("page_size", String(opts.pageSize ?? 100));
  if (opts.page) url.searchParams.set("page", String(opts.page));
  if (opts.dateAfter) url.searchParams.set("date_after", opts.dateAfter);
  if (opts.search) url.searchParams.set("search", opts.search);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`OpenLegalData API ${res.status}`);
  return (await res.json()) as OpenLegalDataResponse;
}

// ── Mapping ───────────────────────────────────────────────────────────

function mapToJudgementRecord(c: OpenLegalDataCase, detail?: OpenLegalDataCase): JudgementRecord {
  const court = c.court?.name ?? "Unbekannt";
  const content = stripHtml(detail?.content ?? c.content ?? "");
  const ecli = c.ecli ?? null;
  const id = ecli || `old-${c.id}`;

  return {
    id,
    ecli,
    file_number: c.file_number ?? null,
    court,
    court_level: classifyCourtLevel(court),
    jurisdiction: "de",
    decision_date: c.date ?? null,
    decision_type: c.type ?? null,
    legal_area: null,
    title: `${court} — ${c.file_number ?? c.id}`,
    content,
    summary: content.slice(0, 500) || null,
    keywords: c.keywords ?? [],
    source: "openlegaldata",
    source_url: c.slug ? `https://de.openlegaldata.io/case/${c.slug}/` : null,
    content_hash: hashContent(content),
    language: c.language ?? "de",
  };
}

// ── Database operations ───────────────────────────────────────────────

export async function upsertJudgement(pool: Pool, j: JudgementRecord): Promise<boolean> {
  const query = `
    INSERT INTO subsumio_judgements (
      id, ecli, file_number, court, court_level, jurisdiction,
      decision_date, decision_type, legal_area, title, content, summary,
      keywords, source, source_url, content_hash, language, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now())
    ON CONFLICT (id) DO UPDATE SET
      ecli = EXCLUDED.ecli,
      file_number = EXCLUDED.file_number,
      court = EXCLUDED.court,
      court_level = EXCLUDED.court_level,
      decision_date = EXCLUDED.decision_date,
      decision_type = EXCLUDED.decision_type,
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      summary = EXCLUDED.summary,
      keywords = EXCLUDED.keywords,
      source_url = EXCLUDED.source_url,
      content_hash = EXCLUDED.content_hash,
      updated_at = now()
    RETURNING (xmax = 0) AS inserted
  `;
  const result = await pool.query(query, [
    j.id,
    j.ecli,
    j.file_number,
    j.court,
    j.court_level,
    j.jurisdiction,
    j.decision_date,
    j.decision_type,
    j.legal_area,
    j.title,
    j.content,
    j.summary,
    j.keywords,
    j.source,
    j.source_url,
    j.content_hash,
    j.language,
  ]);
  return result.rows[0]?.inserted ?? false;
}

export async function upsertJudgementChunks(
  pool: Pool,
  judgementId: string,
  chunks: { text: string; type: string; tokenCount: number }[]
): Promise<void> {
  // Delete existing chunks
  await pool.query("DELETE FROM subsumio_judgement_chunks WHERE judgement_id = $1", [judgementId]);

  // Insert new chunks
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await pool.query(
      `INSERT INTO subsumio_judgement_chunks (judgement_id, chunk_index, chunk_text, chunk_type, token_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [judgementId, i, chunk.text, chunk.type, chunk.tokenCount]
    );
  }

  // Mark as chunked
  await pool.query("UPDATE subsumio_judgements SET embedded_at = NULL WHERE id = $1", [
    judgementId,
  ]);
}

// ── Chunking ──────────────────────────────────────────────────────────

const CHUNK_SIZE = 800; // tokens (approx 4 chars/token)
const CHUNK_OVERLAP = 100;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string): { text: string; type: string; tokenCount: number }[] {
  if (!text || text.trim().length === 0) return [];

  const chunks: { text: string; type: string; tokenCount: number }[] = [];
  const words = text.split(/\s+/);
  const wordsPerChunk = Math.floor(CHUNK_SIZE / 1.3); // approx words per chunk

  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + wordsPerChunk, words.length);
    const chunkText = words.slice(start, end).join(" ");
    const tokenCount = estimateTokens(chunkText);

    // Classify chunk type based on position
    let type = "body";
    if (start === 0) type = "leitsatz";
    else if (chunks.length === 1) type = "tenor";

    chunks.push({ text: chunkText, type, tokenCount });
    start = end - CHUNK_OVERLAP > start ? end - CHUNK_OVERLAP : end;
  }

  return chunks;
}

// ── Bulk Import ───────────────────────────────────────────────────────

export async function bulkImportOpenLegalData(
  pool: Pool,
  opts: {
    maxPages?: number;
    pageSize?: number;
    dateAfter?: string;
    fetchDetails?: boolean;
    onProgress?: (progress: ImportProgress) => void;
  } = {}
): Promise<ImportProgress> {
  await ensureLegalGraphSchema(pool);

  const maxPages = opts.maxPages ?? 10;
  const pageSize = opts.pageSize ?? 100;
  const fetchDetails = opts.fetchDetails ?? true;

  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let total = 0;
  let nextUrl: string | null = null;
  let currentPage = 1;

  // Update sync state
  await pool.query(
    `INSERT INTO subsumio_judgement_sync_state (source, sync_status, last_sync_at)
     VALUES ('openlegaldata', 'running', now())
     ON CONFLICT (source) DO UPDATE SET sync_status = 'running', last_sync_at = now()`
  );

  try {
    for (let page = 1; page <= maxPages; page++) {
      const response = await fetchCaseList({
        page,
        pageSize,
        dateAfter: opts.dateAfter,
      });

      total = response.count;
      currentPage = page;

      for (const caseItem of response.results) {
        try {
          let detail: OpenLegalDataCase | null = null;
          if (fetchDetails && caseItem.id) {
            detail = await fetchCaseDetail(caseItem.id);
          }

          const record = mapToJudgementRecord(caseItem, detail ?? undefined);

          // Skip if content hash matches (already up-to-date)
          const existing = await pool.query(
            "SELECT content_hash FROM subsumio_judgements WHERE id = $1",
            [record.id]
          );
          if (existing.rows[0]?.content_hash === record.content_hash) {
            skipped++;
            continue;
          }

          const wasInserted = await upsertJudgement(pool, record);
          if (wasInserted || existing.rows.length === 0) {
            // Chunk the content
            if (record.content) {
              const chunks = chunkText(record.content);
              if (chunks.length > 0) {
                await upsertJudgementChunks(pool, record.id, chunks);
              }
            }
            imported++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors++;
          console.error(`[legal-graph] Failed to import case ${caseItem.id}:`, err);
        }
      }

      nextUrl = response.next;

      if (opts.onProgress) {
        opts.onProgress({
          source: "openlegaldata",
          imported,
          skipped,
          errors,
          total,
          hasMore: !!response.next,
          nextCursor: response.next,
        });
      }

      if (!response.next) break;
    }
  } finally {
    await pool.query(
      `UPDATE subsumio_judgement_sync_state
       SET sync_status = 'completed', last_sync_at = now(),
           total_imported = total_imported + $1, last_error = $2
       WHERE source = 'openlegaldata'`,
      [imported, errors > 0 ? `${errors} errors during import` : null]
    );
  }

  return {
    source: "openlegaldata",
    imported,
    skipped,
    errors,
    total,
    hasMore: !!nextUrl,
    nextCursor: nextUrl,
  };
}

// ── Incremental Sync ──────────────────────────────────────────────────

export async function syncDeltaOpenLegalData(
  pool: Pool,
  opts: { onProgress?: (progress: ImportProgress) => void } = {}
): Promise<ImportProgress> {
  await ensureLegalGraphSchema(pool);

  // Get last sync cursor
  const stateResult = await pool.query(
    "SELECT last_cursor FROM subsumio_judgement_sync_state WHERE source = 'openlegaldata'"
  );
  const lastCursor = stateResult.rows[0]?.last_cursor as string | null;

  // Use last sync date as date_after filter
  const dateAfter =
    lastCursor || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const result = await bulkImportOpenLegalData(pool, {
    maxPages: 5,
    pageSize: 100,
    dateAfter,
    fetchDetails: true,
    onProgress: opts.onProgress,
  });

  // Update cursor to today
  await pool.query(
    "UPDATE subsumio_judgement_sync_state SET last_cursor = $1 WHERE source = 'openlegaldata'",
    [new Date().toISOString().split("T")[0]]
  );

  return result;
}

// ── Stats ─────────────────────────────────────────────────────────────

export async function getJudgementStats(pool: Pool): Promise<{
  total: number;
  embedded: number;
  withCitations: number;
  byCourt: { court: string; count: number }[];
  byTreatment: { status: string; count: number }[];
  syncState: { source: string; status: string; lastSync: string | null; total: number }[];
}> {
  await ensureLegalGraphSchema(pool);

  const [totalResult, embeddedResult, citationResult, courtResult, treatmentResult, syncResult] =
    await Promise.all([
      pool.query("SELECT count(*) as total FROM subsumio_judgements"),
      pool.query("SELECT count(*) as total FROM subsumio_judgements WHERE embedded_at IS NOT NULL"),
      pool.query("SELECT count(*) as total FROM subsumio_judgements WHERE citation_count > 0"),
      pool.query(
        "SELECT court, count(*) as count FROM subsumio_judgements GROUP BY court ORDER BY count DESC LIMIT 20"
      ),
      pool.query(
        "SELECT treatment_status as status, count(*) as count FROM subsumio_judgements GROUP BY treatment_status"
      ),
      pool.query(
        "SELECT source, sync_status as status, last_sync_at as last_sync, total_imported as total FROM subsumio_judgement_sync_state"
      ),
    ]);

  return {
    total: parseInt(totalResult.rows[0]?.total ?? "0"),
    embedded: parseInt(embeddedResult.rows[0]?.total ?? "0"),
    withCitations: parseInt(citationResult.rows[0]?.total ?? "0"),
    byCourt: courtResult.rows,
    byTreatment: treatmentResult.rows,
    syncState: syncResult.rows,
  };
}
