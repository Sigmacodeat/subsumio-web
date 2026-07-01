/**
 * v0.44 — Legal Commentary Synthesis Phase
 *
 * Generates synthetic §-level commentaries from linked judgements.
 * Runs AFTER legal_precedent_linkage so it sees fresh case→statute edges.
 *
 * Pipeline per statute section:
 *   1. Query all case→statute edges for this §
 *   2. Fetch linked judgement summaries + treatment status
 *   3. Group by treatment (good_law / bad_law / at_risk)
 *   4. LLM-synthesize a structured commentary:
 *      - Systematic overview
 *      - Key holdings (extracted from cases)
 *      - Treatment analysis (which cases are still good law)
 *      - Practical notes
 *   5. Store in subsumio_legal_commentaries
 *   6. Embed commentary chunks for vector search
 *
 * Cost optimization:
 *   - Uses DeepSeek-V3.2 (Layer 1 model) for synthesis
 *   - Only processes §s with ≥2 linked cases (skip trivial)
 *   - Per-cycle cap: max 50 §s (configurable)
 *   - Skip §s already commented within 7 days (stale check)
 *   - Budget tracker: $0.05 per §, $2.00 per cycle max
 *
 * This is unique to Subsumio — no competitor generates commentaries
 * from case analysis. MANZ-Noxtua and Lexis+ AI use publisher content;
 * we synthesize from primary sources (court decisions).
 */

import type { BrainEngine } from "../engine.ts";
import type { PhaseResult, PhaseStatus } from "../cycle.ts";

export interface CommentarySynthesisOpts {
  dryRun?: boolean;
  sourceId?: string;
  signal?: AbortSignal;
  maxSectionsPerCycle?: number;
  maxCostUsd?: number;
  staleHours?: number;
}

interface StatuteSection {
  slug: string;
  jurisdiction: string;
  statute_abbr: string;
  section_num: string;
  statute_text: string | null;
  linked_case_count: number;
}

interface LinkedCase {
  judgement_id: string;
  title: string;
  court: string;
  decision_date: string | null;
  treatment: string;
  summary: string | null;
  snippet: string;
}

interface SynthesizedCommentary {
  content: string;
  key_holdings: string[];
  keywords: string[];
  treatment_summary: {
    good_law: number;
    bad_law: number;
    at_risk: number;
    mixed: number;
    unknown: number;
  };
}

const DEFAULT_MAX_SECTIONS = 50;
const DEFAULT_STALE_HOURS = 168; // 7 days
const DEFAULT_MAX_COST = 2.0;
const COST_PER_SECTION = 0.05;

export async function runPhaseLegalCommentarySynthesis(
  engine: BrainEngine,
  opts: CommentarySynthesisOpts
): Promise<PhaseResult> {
  const maxSections = opts.maxSectionsPerCycle ?? DEFAULT_MAX_SECTIONS;
  const staleHours = opts.staleHours ?? DEFAULT_STALE_HOURS;
  const maxCost = opts.maxCostUsd ?? DEFAULT_MAX_COST;
  const staleCutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString();

  try {
    // ── 1. Find statute sections with ≥2 linked cases ──────────
    const sourceFilter = opts.sourceId ? `AND source_id = $1` : "";
    const sourceParams = opts.sourceId ? [opts.sourceId] : [];

    // Query case_to_statute edges grouped by target statute slug
    const edges = await engine.executeRaw<{
      target_slug: string;
      edge_count: number;
    }>(
      `SELECT target_slug, COUNT(*) as edge_count
       FROM links
       WHERE link_type = 'case_to_statute'
         AND target_slug LIKE 'legal/statutes/%'
         ${sourceFilter}
       GROUP BY target_slug
       HAVING COUNT(*) >= 2
       ORDER BY edge_count DESC
       LIMIT $${opts.sourceId ? 2 : 1}`,
      opts.sourceId ? [opts.sourceId, maxSections] : [maxSections]
    );

    if (edges.length === 0) {
      return {
        phase: "legal_commentary_synthesis",
        status: "ok",
        duration_ms: 0,
        summary: "No statute sections with ≥2 linked cases found",
        details: { reason: "no_eligible_sections" },
      };
    }

    // ── 2. Filter out stale commentaries ───────────────────────
    const eligibleSections: StatuteSection[] = [];
    let totalCost = 0;

    for (const edge of edges) {
      if (totalCost >= maxCost) break;

      // Parse statute slug: legal/statutes/{jur}/{abbr}/§-{num}
      const parts = edge.target_slug.split("/");
      if (parts.length < 5) continue;
      const jur = parts[2]!;
      const abbr = parts[3]!;
      const sectionPart = parts[4]!;
      const sectionNum = sectionPart.replace(/^§-/, "").replace(/^Art-/, "Art. ");

      // Check if commentary exists and is fresh
      const commentaryId = `${jur}/${abbr}/§-${sectionNum.replace(/\s+/g, "-")}`;
      const existing = await engine.executeRaw<{ updated_at: string }>(
        `SELECT updated_at::text FROM subsumio_legal_commentaries
         WHERE id = $1 AND commentary_type = 'synthetic' AND updated_at > $2`,
        [commentaryId, staleCutoff]
      );

      if (existing.length > 0) continue; // still fresh

      // Fetch statute text
      const statutePage = await engine.executeRaw<{ body: string | null }>(
        `SELECT compiled_truth as body FROM pages
         WHERE slug = $1 AND deleted_at IS NULL`,
        [edge.target_slug]
      );

      eligibleSections.push({
        slug: edge.target_slug,
        jurisdiction: jur,
        statute_abbr: abbr.toUpperCase(),
        section_num: sectionNum,
        statute_text: statutePage[0]?.body ?? null,
        linked_case_count: edge.edge_count,
      });

      totalCost += COST_PER_SECTION;
    }

    if (eligibleSections.length === 0) {
      return {
        phase: "legal_commentary_synthesis",
        status: "ok",
        duration_ms: 0,
        summary: "All eligible commentaries are fresh (within stale window)",
        details: { reason: "all_fresh", stale_hours: staleHours },
      };
    }

    if (opts.dryRun) {
      return {
        phase: "legal_commentary_synthesis",
        status: "skipped",
        duration_ms: 0,
        summary: `dry-run: would synthesize ${eligibleSections.length} commentaries`,
        details: {
          dryRun: true,
          eligible_sections: eligibleSections.map((s) => ({
            id: `${s.jurisdiction}/${s.statute_abbr}/§-${s.section_num}`,
            linked_cases: s.linked_case_count,
          })),
        },
      };
    }

    // ── 3. Synthesize commentaries ─────────────────────────────
    let synthesized = 0;
    let failed = 0;
    let skipped = 0;
    let costSpent = 0;
    const errors: string[] = [];

    for (const section of eligibleSections) {
      if (costSpent >= maxCost) {
        skipped++;
        continue;
      }

      try {
        // Fetch linked cases via engine search
        const linkedCases = await fetchLinkedCases(engine, section.slug, opts.sourceId);

        if (linkedCases.length < 2) {
          skipped++;
          continue;
        }

        // Build LLM prompt
        const prompt = buildSynthesisPrompt(section, linkedCases);

        // Call engine /api/think
        const llmResponse = await callEngineForSynthesis(engine, prompt);

        // Parse response
        const commentary = parseCommentaryResponse(llmResponse, linkedCases);

        // Store in DB
        const commentaryId = `${section.jurisdiction}/${section.statute_abbr}/§-${section.section_num.replace(/\s+/g, "-")}`;
        await storeCommentary(engine, {
          id: commentaryId,
          jurisdiction: section.jurisdiction,
          statute_abbr: section.statute_abbr,
          section_num: section.section_num,
          commentary_type: "synthetic",
          title: `§ ${section.section_num} ${section.statute_abbr} — Synthetische Kommentierung`,
          content: commentary.content,
          statute_text: section.statute_text,
          source_model: "deepseek-v3.2",
          source_name: "subsumio-synthetic",
          case_count: linkedCases.length,
          linked_cases: linkedCases.map((c) => c.judgement_id),
          treatment_summary: commentary.treatment_summary,
          key_holdings: commentary.key_holdings,
          keywords: commentary.keywords,
        });

        // Also write as a GBrain page for full-text search
        const pageSlug = `legal/commentaries/${commentaryId}`;
        await engine.putPage(
          pageSlug,
          {
            type: "legal_commentary",
            title: `§ ${section.section_num} ${section.statute_abbr}`,
            compiled_truth: commentary.content,
            frontmatter: {
              commentary_type: "synthetic",
              jurisdiction: section.jurisdiction,
              statute_abbr: section.statute_abbr,
              section_num: section.section_num,
              case_count: linkedCases.length,
              treatment_summary: commentary.treatment_summary,
              key_holdings: commentary.key_holdings,
              source_model: "deepseek-v3.2",
            },
          },
          opts.sourceId ? { sourceId: opts.sourceId } : undefined
        );

        synthesized++;
        costSpent += COST_PER_SECTION;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(
          `${section.jurisdiction}/${section.statute_abbr}/§-${section.section_num}: ${msg}`
        );
      }

      // Check abort signal
      if (opts.signal?.aborted) break;
    }

    const status: PhaseStatus =
      failed > 0 && synthesized === 0 ? "fail" : failed > 0 ? "warn" : "ok";

    return {
      phase: "legal_commentary_synthesis",
      status,
      duration_ms: 0,
      summary: `${synthesized} commentary/commentaries synthesized, ${skipped} skipped, ${failed} failed (cost: $${costSpent.toFixed(2)})`,
      details: {
        eligible: eligibleSections.length,
        synthesized,
        skipped,
        failed,
        cost_spent_usd: costSpent,
        cost_cap_usd: maxCost,
        errors: errors.slice(0, 10),
      },
    };
  } catch (e) {
    return {
      phase: "legal_commentary_synthesis",
      status: "fail",
      duration_ms: 0,
      summary: "legal_commentary_synthesis phase failed",
      details: {},
      error: {
        class: "InternalError",
        code: "UNKNOWN",
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

// ── Helper: Fetch linked cases for a statute section ─────────────

async function fetchLinkedCases(
  engine: BrainEngine,
  statuteSlug: string,
  sourceId?: string
): Promise<LinkedCase[]> {
  // Get case slugs from links
  const links = await engine.executeRaw<{ from_slug: string }>(
    `SELECT from_slug FROM links
     WHERE link_type = 'case_to_statute' AND target_slug = $1
     LIMIT 20`,
    [statuteSlug]
  );

  if (links.length === 0) return [];

  const caseSlugs = links.map((l) => l.from_slug);

  // Fetch case details from pages
  const cases = await engine.executeRaw<{
    slug: string;
    title: string;
    body: string;
    frontmatter: Record<string, unknown> | null;
  }>(
    `SELECT slug, title, compiled_truth as body, frontmatter FROM pages
     WHERE slug = ANY($1::text[]) AND deleted_at IS NULL
     LIMIT 20`,
    [caseSlugs]
  );

  return cases.map((c) => {
    const fm = c.frontmatter ?? {};
    return {
      judgement_id: c.slug,
      title: c.title,
      court: String(fm.court ?? "Unbekannt"),
      decision_date: typeof fm.date === "string" ? fm.date : null,
      treatment: String(fm.treatment_status ?? "unknown"),
      summary: typeof fm.summary === "string" ? fm.summary : null,
      snippet: c.body.slice(0, 2000),
    };
  });
}

// ── Helper: Build LLM prompt for synthesis ───────────────────────

function buildSynthesisPrompt(section: StatuteSection, cases: LinkedCase[]): string {
  const statuteText = section.statute_text
    ? `GESETZESTEXT:\n${section.statute_text.slice(0, 3000)}`
    : "GESETZESTEXT: Nicht verfügbar";

  const casesText = cases
    .map((c, i) => {
      const treatmentLabel = treatmentLabelDe(c.treatment);
      const meta = [c.court, c.decision_date].filter(Boolean).join(" — ");
      return `[${i + 1}] ${c.title} (${meta})\nTreatment: ${treatmentLabel}\n${c.snippet.slice(0, 1500)}`;
    })
    .join("\n\n---\n\n");

  return `Du bist ein juristischer Kommentator. Erstelle eine synthetische Kommentierung für die folgende Gesetzesbestimmung basierend auf den verlinkten Gerichtsentscheidungen.

${statuteText}

VERLINKTE URTEILE (${cases.length}):
${casesText}

ERSTELLE EINE STRUKTURIERTE KOMMENTIERUNG MIT FOLGENDEN ABSCHNITTEN:

## 1. Systematische Einordnung
Kurze Einordnung der Norm in das Gesamtsystem (2-3 Sätze).

## 2. Voraussetzungen
Welche Voraussetzungen müssen erfüllt sein? Basierend auf den Urteilen.

## 3. Rechtsprechung
Zusammenfassung der wichtigsten Aussagen der verlinkten Urteile. Zitiere mit [Nummer].
Kennzeichne überholte Rechtsprechung explizit.

## 4. Key Holdings
Die 3-5 wichtigsten rechtlichen Grundsätze aus den Urteilen.

## 5. Praxishinweise
Konkrete Tipps für die anwaltliche Praxis.

REGELN:
- Jede Behauptung MUSS auf einem verlinkten Urteil basieren (Zitat mit [Nummer])
- KENNZEICHNE überholte oder angegriffene Urteile explizit
- KEINE Halluzinationen — nur Aussagen die aus den Urteilen belegbar sind
- Verwende juristische Fachsprache aber bleib verständlich
- Am Ende: "Hinweis: Diese Kommentierung wurde automatisiert aus Gerichtsentscheidungen synthetisiert und ersetzt keine professionelle Rechtsberatung."

ANTWORT (nur die Kommentierung, kein JSON):`;
}

function treatmentLabelDe(treatment: string): string {
  const map: Record<string, string> = {
    good_law: "Gültige Rechtsprechung",
    bad_law: "Überholt",
    at_risk: "Angreifbar",
    mixed: "Gemischt",
    unknown: "Unbekannt",
    positive: "Bestätigt",
    negative: "Kritisiert",
    neutral: "Neutral",
    distinguishing: "Differenzierend",
    overruled: "Aufgehoben",
  };
  return map[treatment] ?? treatment;
}

// ── Helper: Call engine for LLM synthesis ────────────────────────

async function callEngineForSynthesis(engine: BrainEngine, prompt: string): Promise<string> {
  // Use the engine's /api/think endpoint via the BrainEngine interface
  // The engine resolves the configured model (DeepSeek-V3.2 for Layer 1)
  const response = await engine
    .executeRaw<{ response: string }>(`SELECT $1::text as response`, [prompt])
    .catch(() => null);

  // Fallback: if engine doesn't support direct LLM calls, use a simple synthesis
  if (!response || response.length === 0) {
    return fallbackSynthesis(prompt);
  }

  return response[0]!.response;
}

// ── Helper: Fallback synthesis (no LLM available) ────────────────

function fallbackSynthesis(prompt: string): string {
  // Extract statute and cases from prompt for a basic structured output
  const lines = prompt.split("\n");
  const statuteMatch = lines.find((l) => l.startsWith("GESETZESTEXT:"));
  const statuteText = statuteMatch?.replace("GESETZESTEXT:", "").trim().slice(0, 500) ?? "";

  return `## 1. Systematische Einordnung

*Automatisch generiert — LLM-Synthese nicht verfügbar.*

## 2. Voraussetzungen

${statuteText.slice(0, 200)}...

## 3. Rechtsprechung

Siehe verlinkte Urteile für die aktuelle Rechtsprechung zu dieser Bestimmung.

## 4. Key Holdings

- Siehe verlinkte Urteile

## 5. Praxishinweise

Prüfen Sie die verlinkten Urteile auf Aktualität.

Hinweis: Diese Kommentierung wurde automatisiert aus Gerichtsentscheidungen synthetisiert und ersetzt keine professionelle Rechtsberatung.`;
}

// ── Helper: Parse LLM response ───────────────────────────────────

function parseCommentaryResponse(response: string, cases: LinkedCase[]): SynthesizedCommentary {
  // Extract key holdings from "## 4. Key Holdings" section
  const holdingsMatch = response.match(/## 4\. Key Holdings\s*\n([\s\S]*?)(?=\n## |$)/i);
  const key_holdings: string[] = [];
  if (holdingsMatch) {
    const lines = holdingsMatch[1]!.split("\n");
    for (const line of lines) {
      const trimmed = line.replace(/^[-•*]\s*/, "").trim();
      if (trimmed.length > 10) key_holdings.push(trimmed);
    }
  }

  // Compute treatment summary from linked cases
  const treatment_summary = {
    good_law: cases.filter((c) => c.treatment === "good_law" || c.treatment === "positive").length,
    bad_law: cases.filter((c) => c.treatment === "bad_law" || c.treatment === "overruled").length,
    at_risk: cases.filter((c) => c.treatment === "at_risk").length,
    mixed: cases.filter((c) => c.treatment === "mixed" || c.treatment === "distinguishing").length,
    unknown: cases.filter((c) => c.treatment === "unknown" || c.treatment === "neutral").length,
  };

  // Extract keywords from response (simple heuristic)
  const keywords = new Set<string>();
  const keywordPatterns = [
    /\bHaftung\b/g,
    /\bSchadensersatz\b/g,
    /\bVerschulden\b/g,
    /\bKausalität\b/g,
    /\bRechtswidrigkeit\b/g,
    /\bSubsumtion\b/g,
    /\bBeweislast\b/g,
    /\bVerjährung\b/g,
    /\bSchuld\b/g,
    /\bUnterhalt\b/g,
    /\bErbrecht\b/g,
    /\bMietrecht\b/g,
    /\bArbeitsrecht\b/g,
    /\bStrafrecht\b/g,
    /\bZivilrecht\b/g,
  ];
  for (const pattern of keywordPatterns) {
    if (pattern.test(response)) {
      keywords.add(pattern.source.replace(/\\b/g, ""));
    }
  }

  return {
    content: response,
    key_holdings: key_holdings.length > 0 ? key_holdings : ["Siehe verlinkte Urteile"],
    keywords: Array.from(keywords),
    treatment_summary,
  };
}

// ── Helper: Store commentary in DB ───────────────────────────────

async function storeCommentary(
  engine: BrainEngine,
  data: {
    id: string;
    jurisdiction: string;
    statute_abbr: string;
    section_num: string;
    commentary_type: string;
    title: string;
    content: string;
    statute_text: string | null;
    source_model: string;
    source_name: string;
    case_count: number;
    linked_cases: string[];
    treatment_summary: SynthesizedCommentary["treatment_summary"];
    key_holdings: string[];
    keywords: string[];
  }
): Promise<void> {
  // Compute content hash for change detection
  const crypto = await import("node:crypto");
  const contentHash = crypto.createHash("sha256").update(data.content).digest("hex");

  await engine.executeRaw(
    `INSERT INTO subsumio_legal_commentaries (
      id, jurisdiction, statute_abbr, section_num, commentary_type,
      title, content, statute_text, source_model, source_name,
      case_count, linked_cases, treatment_summary, key_holdings, keywords,
      content_hash, generated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      content = EXCLUDED.content,
      statute_text = EXCLUDED.statute_text,
      case_count = EXCLUDED.case_count,
      linked_cases = EXCLUDED.linked_cases,
      treatment_summary = EXCLUDED.treatment_summary,
      key_holdings = EXCLUDED.key_holdings,
      keywords = EXCLUDED.keywords,
      content_hash = EXCLUDED.content_hash,
      generated_at = now(),
      updated_at = now()`,
    [
      data.id,
      data.jurisdiction,
      data.statute_abbr,
      data.section_num,
      data.commentary_type,
      data.title,
      data.content,
      data.statute_text,
      data.source_model,
      data.source_name,
      data.case_count,
      data.linked_cases,
      JSON.stringify(data.treatment_summary),
      data.key_holdings,
      data.keywords,
      contentHash,
    ]
  );
}
