import type { Pool } from "pg";

// ── Citation patterns for German legal documents ──────────────────────

// German case citation patterns:
// "BGH, Urteil vom 15.03.2024 - I ZR 1/24"
// "BVerfG, Beschluss vom 10.5.2023 - 1 BvR 1234/23"
// "BGH NJW 2024, 123"
// "EuGH, Urteil vom 5.6.2023 - C-123/22"

interface CitationPattern {
  regex: RegExp;
  type: "case" | "statute";
  extract: (match: RegExpMatchArray) => { reference: string; statute?: string };
}

const CASE_CITATION_PATTERNS: RegExp[] = [
  // "BGH, Urteil vom 15.03.2024 - I ZR 1/24"
  /((?:BGH|BVerfG|BVerwG|BFH|BAG|BSG|EuGH|EuG|OLG|OVG|VGH|FG|LAG|LSG|VG|LG|AG|SG|StA|GA|BayObLG|KG)\s*,\s*(?:Urteil|Beschluss|Verordnung|Entscheidung)\s+vom\s+\d{1,2}\.\d{1,2}\.\d{2,4}\s*[-–]\s*[\w\s/.\-()]+)/g,
  // "BGH NJW 2024, 123" (journal citation)
  /((?:BGH|BVerfG|BVerwG|BFH|BAG|BSG|EuGH)\s+(?:NJW|NVwZ|BB|DB|CR|GRUR|JZ|JuS|NJRR|MDR|WM|ZIP|WuB|BStBl|BFHE|BAGE|BSGE|NVwZ-RR|DVBl|DÖV)\s+\d{4},\s*\d+)/g,
  // "BVerfG, 1 BvR 1234/23"
  /((?:BVerfG|BGH|BFH|BVerwG|BAG|BSG)\s*,?\s*[\dA-Za-z]+\s+\w+\s+\d+\/\d+)/g,
  // ECLI citations
  /(ECLI:DE:[A-Z]+:\d{4}:[\w.]+)/g,
];

const STATUTE_CITATION_PATTERNS: RegExp[] = [
  // "§ 433 BGB", "§§ 433, 434 BGB"
  /§+\s*(\d+[a-zA-Z]?(?:\s*,\s*\d+[a-zA-Z]?)*)\s+(BGB|HGB|StGB|ZPO|StPO|GG|AO|EStG|UStG|GmbHG|AktG|InsO|FamFG|UWG|GWB|BauGB|VwVfG|SGB\s+[IVX]+|BauGB|BUrlG|KSchG|BGB|BetrVG|BVerfGG|ZVG|EGG|EGZPO|EGStGB|EUStB|EStG|ErbStG)/g,
  // "Art. 1 GG", "Art. 2 Abs. 1 GG"
  /(Art\.\s*\d+\s*(?:Abs\.\s*\d+\s*)?(?:GG|EMRK|EUV|AEUV|DSGVO|Grundrechtecharta))/g,
  // "§ 1 Abs. 1 Nr. 1 BGB"
  /§+\s*(\d+[a-zA-Z]?)\s+Abs\.\s*\d+\s*(?:Nr\.\s*\d+\s*)?(BGB|HGB|StGB|ZPO|StPO|GG|AO|EStG|UStG|GmbHG|AktG|InsO|FamFG|UWG)/g,
];

// ── Citation extraction ───────────────────────────────────────────────

export interface ExtractedCitation {
  reference: string;
  type: "case" | "statute";
  statute?: string;
  context: string;
  position: number;
}

export function extractCitations(text: string): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];
  const seen = new Set<string>();

  // Extract case citations
  for (const pattern of CASE_CITATION_PATTERNS) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const reference = match[1].trim();
      if (reference.length < 5 || reference.length > 200) continue;
      if (seen.has(reference)) continue;
      seen.add(reference);

      const start = Math.max(0, match.index - 150);
      const end = Math.min(text.length, match.index + reference.length + 150);
      const context = text.slice(start, end).trim();

      citations.push({
        reference,
        type: "case" as const,
        context,
        position: match.index,
      });
    }
  }

  // Extract statute citations
  for (const pattern of STATUTE_CITATION_PATTERNS) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const reference = match[0].trim();
      if (reference.length < 4 || reference.length > 100) continue;
      const statute = match[2] || match[1] || reference;
      const key = `statute:${statute}:${reference}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const start = Math.max(0, match.index - 150);
      const end = Math.min(text.length, match.index + reference.length + 150);
      const context = text.slice(start, end).trim();

      citations.push({
        reference,
        type: "statute" as const,
        statute,
        context,
        position: match.index,
      });
    }
  }

  return citations;
}

// ── Resolve cited references to judgement IDs in our corpus ───────────

async function resolveCitationToJudgement(pool: Pool, reference: string): Promise<string | null> {
  // Try ECLI match first
  const ecliMatch = reference.match(/ECLI:DE:[A-Z]+:\d{4}:[\w.]+/);
  if (ecliMatch) {
    const result = await pool.query("SELECT id FROM subsumio_judgements WHERE ecli = $1", [
      ecliMatch[0],
    ]);
    if (result.rows[0]) return result.rows[0].id;
  }

  // Try file number match (fuzzy)
  const fileNumberMatch = reference.match(/[\w\s]+\s+[\dA-Za-z]+\s+\w+\s+\d+\/\d+/);
  if (fileNumberMatch) {
    const fileNumber = fileNumberMatch[0].trim();
    const result = await pool.query(
      "SELECT id FROM subsumio_judgements WHERE file_number ILIKE $1 LIMIT 1",
      [`%${fileNumber}%`]
    );
    if (result.rows[0]) return result.rows[0].id;
  }

  // Try court + date match
  const courtDateMatch = reference.match(
    /(BGH|BVerfG|BVerwG|BFH|BAG|BSG|EuGH)\s*,\s*(?:Urteil|Beschluss)\s+vom\s+(\d{1,2}\.\d{1,2}\.\d{2,4})/
  );
  if (courtDateMatch) {
    const court = courtDateMatch[1];
    const dateStr = courtDateMatch[2];
    // Parse German date format DD.MM.YYYY
    const parts = dateStr.split(".");
    if (parts.length === 3) {
      const isoDate = `${parts[2].length === 2 ? "20" + parts[2] : parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      const result = await pool.query(
        "SELECT id FROM subsumio_judgements WHERE court = $1 AND decision_date = $2 LIMIT 1",
        [court, isoDate]
      );
      if (result.rows[0]) return result.rows[0].id;
    }
  }

  return null;
}

// ── Build citation graph for a single judgement ───────────────────────

export async function buildCitationGraphForJudgement(
  pool: Pool,
  judgementId: string
): Promise<{ caseCitations: number; statuteCitations: number; resolved: number }> {
  // Get judgement content
  const result = await pool.query("SELECT content FROM subsumio_judgements WHERE id = $1", [
    judgementId,
  ]);
  const content = result.rows[0]?.content as string | null;
  if (!content) return { caseCitations: 0, statuteCitations: 0, resolved: 0 };

  const citations = extractCitations(content);
  const caseCitations = citations.filter((c) => c.type === "case");
  const statuteCitations = citations.filter((c) => c.type === "statute");

  let resolved = 0;

  for (const citation of caseCitations) {
    try {
      const citedId = await resolveCitationToJudgement(pool, citation.reference);

      await pool.query(
        `INSERT INTO subsumio_judgement_citations
          (citing_id, cited_id, cited_reference, cited_type, context_snippet)
         VALUES ($1, $2, $3, 'case', $4)
         ON CONFLICT DO NOTHING`,
        [judgementId, citedId, citation.reference, citation.context.slice(0, 500)]
      );

      if (citedId) resolved++;
    } catch (err) {
      console.error(`[legal-graph] Failed to insert citation: ${err}`);
    }
  }

  for (const citation of statuteCitations) {
    try {
      await pool.query(
        `INSERT INTO subsumio_judgement_citations
          (citing_id, cited_id, cited_reference, cited_type, cited_statute, context_snippet)
         VALUES ($1, NULL, $2, 'statute', $3, $4)
         ON CONFLICT DO NOTHING`,
        [judgementId, citation.reference, citation.statute, citation.context.slice(0, 500)]
      );
    } catch (err) {
      console.error(`[legal-graph] Failed to insert statute citation: ${err}`);
    }
  }

  return {
    caseCitations: caseCitations.length,
    statuteCitations: statuteCitations.length,
    resolved,
  };
}

// ── Build citation graph for all judgements (batch) ───────────────────

export async function buildCitationGraphBatch(
  pool: Pool,
  opts: { batchSize?: number; maxItems?: number } = {}
): Promise<{ processed: number; totalCitations: number; resolved: number }> {
  const batchSize = opts.batchSize ?? 100;
  const maxItems = opts.maxItems ?? 1000;

  let processed = 0;
  let totalCitations = 0;
  let resolved = 0;
  let offset = 0;

  while (processed < maxItems) {
    const result = await pool.query(
      `SELECT id FROM subsumio_judgements
       WHERE id NOT IN (
         SELECT DISTINCT citing_id FROM subsumio_judgement_citations
         WHERE extracted_at > updated_at
       )
       ORDER BY imported_at ASC
       LIMIT $1 OFFSET $2`,
      [batchSize, offset]
    );

    if (result.rows.length === 0) break;

    for (const row of result.rows) {
      const stats = await buildCitationGraphForJudgement(pool, row.id);
      totalCitations += stats.caseCitations + stats.statuteCitations;
      resolved += stats.resolved;
      processed++;
    }

    offset += batchSize;
  }

  return { processed, totalCitations, resolved };
}

// ── Get citation graph for a judgement ────────────────────────────────

export interface CitationNode {
  id: string;
  reference: string;
  treatment: string;
  court?: string;
  decision_date?: string;
  title?: string;
  context: string;
}

export async function getCitationGraph(
  pool: Pool,
  judgementId: string
): Promise<{
  outgoing: CitationNode[];
  incoming: CitationNode[];
}> {
  const [outgoingResult, incomingResult] = await Promise.all([
    pool.query(
      `SELECT c.cited_reference, c.cited_id, c.treatment, c.context_snippet, c.cited_statute,
              j.court, j.decision_date, j.title
       FROM subsumio_judgement_citations c
       LEFT JOIN subsumio_judgements j ON c.cited_id = j.id
       WHERE c.citing_id = $1
       ORDER BY c.extracted_at DESC`,
      [judgementId]
    ),
    pool.query(
      `SELECT c.citing_id as cited_id, c.cited_reference, c.treatment, c.context_snippet,
              j.court, j.decision_date, j.title
       FROM subsumio_judgement_citations c
       JOIN subsumio_judgements j ON c.citing_id = j.id
       WHERE c.cited_id = $1
       ORDER BY c.extracted_at DESC`,
      [judgementId]
    ),
  ]);

  const mapRow = (row: (typeof outgoingResult.rows)[0]): CitationNode => ({
    id: row.cited_id ?? row.cited_reference,
    reference: row.cited_reference,
    treatment: row.treatment ?? "unknown",
    court: row.court ?? undefined,
    decision_date: row.decision_date
      ? new Date(row.decision_date).toISOString().split("T")[0]
      : undefined,
    title: row.title ?? undefined,
    context: row.context_snippet ?? "",
  });

  return {
    outgoing: outgoingResult.rows.map(mapRow),
    incoming: incomingResult.rows.map(mapRow),
  };
}
