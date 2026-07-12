/**
 * Gap 4: LLM-Assisted Principle Extraction
 *
 * Extracts legal principles from landmark court decisions using LLM analysis.
 * Principles are high-level legal rules that can be applied across cases —
 * e.g. "The injured party must mitigate damages (§ 254 BGB)".
 *
 * Architecture:
 * 1. Input: judgement text (court decision)
 * 2. LLM prompt: "Extract the core legal principles from this decision"
 * 3. Output: structured principles with citations and hierarchy level
 * 4. Store: principles inserted into subsumio_legal_graph_nodes as "principle" type
 *           with edges to the source case ("interprets_article", "applies_principle")
 *
 * Activation:
 * - Run on landmark cases (citation_count > threshold or court_level = "supreme")
 * - Batch processing via cron or admin trigger
 * - Not on every search — only on import or manual trigger
 */

import type { Pool } from "pg";
import { ensureLegalGraphSchema } from "./schema";

// ── Types ─────────────────────────────────────────────────────────────

export interface ExtractedPrinciple {
  /** Short title, e.g. "Schadensminderungspflicht" */
  title: string;
  /** The principle statement, 1-3 sentences */
  statement: string;
  /** Legal area: "civil", "criminal", "public", "tax", "eu" */
  legal_area: string;
  /** Hierarchy level: "principle" (highest) */
  hierarchy_level: "principle";
  /** Citations supporting this principle */
  citations: string[];
  /** Source judgement ECLI or ID */
  source_judgement_id: string;
  /** Confidence 0-1 from LLM extraction */
  confidence: number;
}

export interface PrincipleExtractionResult {
  principles: ExtractedPrinciple[];
  model_used: string;
  latency_ms: number;
  error?: string;
}

export interface PrincipleExtractionOpts {
  /** Judgement ID (subsumio_judgements.id) */
  judgementId: string;
  /** Judgement text content */
  judgementText: string;
  /** Jurisdiction: "de", "at", "ch", "eu" */
  jurisdiction: string;
  /** LLM generate function (inject for testability) */
  generate?: (prompt: string, systemPrompt: string) => Promise<string>;
}

// ── LLM Prompt ────────────────────────────────────────────────────────

const PRINCIPLE_EXTRACTION_SYSTEM_PROMPT = `You are a legal expert system that extracts core legal principles from court decisions.

Your task:
1. Identify the fundamental legal principles established or applied in the decision.
2. A "principle" is a high-level legal rule that transcends the specific case — it can be applied to future cases.
3. Each principle must be:
   - Concise (1-3 sentences)
   - General (not case-specific facts)
   - Supported by statutory citations if available

Output format: JSON array of objects:
[
  {
    "title": "Short German title (e.g. 'Schadensminderungspflicht')",
    "statement": "The principle statement in German (1-3 sentences)",
    "legal_area": "civil|criminal|public|tax|eu",
    "citations": ["§ 254 BGB", "§ 249 BGB"],
    "confidence": 0.0-1.0
  }
]

Rules:
- Extract ONLY principles, not case-specific holdings.
- If no clear principles are present, return an empty array [].
- Output MUST be valid JSON. No markdown, no code blocks, no commentary.`;

const PRINCIPLE_EXTRACTION_USER_TEMPLATE = `Extract legal principles from this court decision (jurisdiction: {jurisdiction}):

---

{judgement_text}

---

Return a JSON array of extracted principles.`;

// ── Extraction ────────────────────────────────────────────────────────

/**
 * Extract legal principles from a court decision using LLM analysis.
 * The generate function is injected for testability — in production it uses the AI gateway.
 */
export async function extractPrinciples(
  opts: PrincipleExtractionOpts
): Promise<PrincipleExtractionResult> {
  const startTime = Date.now();

  // Truncate judgement text to avoid token overflow (keep first 8000 chars — usually enough for principle extraction)
  const truncatedText = opts.judgementText.slice(0, 8000);
  const userPrompt = PRINCIPLE_EXTRACTION_USER_TEMPLATE
    .replace("{jurisdiction}", opts.jurisdiction)
    .replace("{judgement_text}", truncatedText);

  const generate = opts.generate ?? defaultGenerate;
  let modelUsed = "unknown";

  try {
    const rawOutput = await generate(userPrompt, PRINCIPLE_EXTRACTION_SYSTEM_PROMPT);
    modelUsed = "llm-extraction";
    const principles = parsePrincipleOutput(rawOutput, opts.judgementId);

    return {
      principles,
      model_used: modelUsed,
      latency_ms: Date.now() - startTime,
    };
  } catch (err) {
    return {
      principles: [],
      model_used: modelUsed,
      latency_ms: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Default generate function — uses the engine's AI gateway.
 * Lazy-imported to avoid pulling AI SDKs at module load.
 */
async function defaultGenerate(prompt: string, systemPrompt: string): Promise<string> {
  const { isAvailable, chat } = await import("../../../server/src/core/ai/gateway");
  if (!isAvailable("chat")) {
    throw new Error("No LLM model available for principle extraction");
  }
  const result = await chat({
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2048,
  });
  return result.text;
}

// ── Output Parser ─────────────────────────────────────────────────────

/**
 * Parse LLM output into structured principles.
 * Handles: raw JSON, code-blocked JSON, JSON with preamble, and empty results.
 */
export function parsePrincipleOutput(
  rawOutput: string,
  sourceJudgementId: string
): ExtractedPrinciple[] {
  // Strategy 1: Direct JSON parse
  try {
    const parsed = JSON.parse(rawOutput);
    if (Array.isArray(parsed)) {
      return normalizePrinciples(parsed, sourceJudgementId);
    }
  } catch {}

  // Strategy 2: Extract JSON array from code block
  const codeBlockMatch = rawOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) {
        return normalizePrinciples(parsed, sourceJudgementId);
      }
    } catch {}
  }

  // Strategy 3: Find JSON array boundaries
  const startIdx = rawOutput.indexOf("[");
  const endIdx = rawOutput.lastIndexOf("]");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    try {
      const jsonStr = rawOutput.slice(startIdx, endIdx + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return normalizePrinciples(parsed, sourceJudgementId);
      }
    } catch {}
  }

  return [];
}

/**
 * Normalize and validate parsed principle objects.
 */
function normalizePrinciples(
  raw: unknown[],
  sourceJudgementId: string
): ExtractedPrinciple[] {
  return raw
    .filter((item) => typeof item === "object" && item !== null)
    .map((item) => {
      const obj = item as Record<string, unknown>;
      const title = String(obj.title ?? "").trim();
      const statement = String(obj.statement ?? "").trim();
      if (!title || !statement) return null;

      const legalArea = String(obj.legal_area ?? "civil").trim().toLowerCase();
      const validAreas = ["civil", "criminal", "public", "tax", "eu"];
      const citations = Array.isArray(obj.citations)
        ? obj.citations.map((c) => String(c)).filter(Boolean)
        : [];
      const confidence = typeof obj.confidence === "number"
        ? Math.max(0, Math.min(1, obj.confidence))
        : 0.5;

      return {
        title,
        statement,
        legal_area: validAreas.includes(legalArea) ? legalArea : "civil",
        hierarchy_level: "principle" as const,
        citations,
        source_judgement_id: sourceJudgementId,
        confidence,
      };
    })
    .filter((p): p is ExtractedPrinciple => p !== null);
}

// ── DB Persistence ────────────────────────────────────────────────────

/**
 * Store extracted principles in the legal graph.
 * Creates "principle" nodes and "applies_principle" edges from the source case.
 */
export async function storePrinciples(
  pool: Pool,
  principles: ExtractedPrinciple[],
  sourceJudgementId: string,
  jurisdiction: string
): Promise<{ stored: number; edges: number }> {
  await ensureLegalGraphSchema(pool);
  let storedCount = 0;
  let edgeCount = 0;

  for (const principle of principles) {
    const nodeId = `${jurisdiction}:principle:${slugify(principle.title)}`;

    try {
      // Insert principle node
      await pool.query(
        `INSERT INTO subsumio_legal_graph_nodes (node_id, node_type, label, jurisdiction, statute, paragraph, slug)
         VALUES ($1, 'principle', $2, $3, NULL, NULL, NULL)
         ON CONFLICT (node_id) DO UPDATE SET updated_at = now()`,
        [nodeId, principle.title, jurisdiction]
      );
      storedCount++;

      // Create edge from source judgement to principle
      const fromNodeId = `${jurisdiction}:case:${sourceJudgementId}`;
      await pool.query(
        `INSERT INTO subsumio_legal_graph_edges (from_node_id, to_node_id, from_jurisdiction, to_jurisdiction, from_statute, to_statute, from_paragraph, to_paragraph, edge_type, context, weight)
         VALUES ($1, $2, $3, $3, NULL, NULL, NULL, NULL, 'applies_principle', $4, $5)
         ON CONFLICT (from_node_id, to_node_id, edge_type) DO NOTHING`,
        [fromNodeId, nodeId, jurisdiction, principle.statement.slice(0, 500), principle.confidence]
      );
      edgeCount++;
    } catch (err) {
      console.error(
        `[principle-extraction] store failed for "${principle.title}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { stored: storedCount, edges: edgeCount };
}

/**
 * Retrieve principles relevant to a legal area or citation.
 * Used by the hierarchical retrieval in gather.ts.
 */
export async function getPrinciplesForArea(
  pool: Pool,
  legalArea: string,
  jurisdiction?: string,
  limit = 10
): Promise<ExtractedPrinciple[]> {
  await ensureLegalGraphSchema(pool);

  try {
    let query = `
      SELECT n.node_id, n.label, n.jurisdiction,
             e.context as statement, e.weight as confidence
      FROM subsumio_legal_graph_nodes n
      JOIN subsumio_legal_graph_edges e ON e.to_node_id = n.node_id
      WHERE n.node_type = 'principle'
        AND e.edge_type = 'applies_principle'
    `;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (jurisdiction) {
      query += ` AND n.jurisdiction = $${paramIdx++}`;
      params.push(jurisdiction);
    }
    query += ` ORDER BY e.weight DESC LIMIT $${paramIdx}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);

    return rows.map((r) => ({
      title: r.label,
      statement: r.statement ?? "",
      legal_area: legalArea,
      hierarchy_level: "principle" as const,
      citations: [],
      source_judgement_id: r.node_id,
      confidence: Number(r.confidence) || 0.5,
    }));
  } catch {
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
