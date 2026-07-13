/**
 * Context Builder — Claim-spezifische Evidence Bundles für juristische Recherche.
 *
 * Erweitert gather.ts um:
 *  1. Claim Extraction — zerlegt eine komplexe juristische Frage in einzelne Claims
 *  2. Evidence Bundles — pro-Claim Kontext mit Source-Diversität
 *  3. Token Budget — pro-Claim Token-Verwaltung mit Priorisierung
 *  4. Explain Mode — transparente Quellenrang- und Ausschlussgründe-Darstellung
 *
 * Architektur:
 *   User Question
 *       ↓
 *   extractClaims() — zerlegt in rechtliche Einzelbehauptungen
 *       ↓
 *   Für jeden Claim:
 *     → Search (hybrid, scoped)
 *     → Source Diversity Check
 *     → Token Budget Allocation
 *     → Build Evidence Bundle
 *       ↓
 *   assembleContext() — merged bundles mit Token Budget
 *       ↓
 *   Explain Mode output (optional)
 */

import type { SearchResult } from "../types.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface LegalClaim {
  /** Unique ID for this claim. */
  id: string;
  /** The claim text (a single legal assertion or question). */
  text: string;
  /** Claim type: normative (§-lookup), factual (case analysis), procedural. */
  type: "normative" | "factual" | "procedural";
  /** Key statutes mentioned in this claim. */
  statutes: string[];
  /** Key legal concepts mentioned. */
  concepts: string[];
  /** Estimated complexity: simple, moderate, complex. */
  complexity: "simple" | "moderate" | "complex";
}

export interface EvidenceEntry {
  /** The search result. */
  result: SearchResult;
  /** Which claim this evidence supports. */
  claimId: string;
  /** Source type: statute, judgement, internal, etc. */
  sourceType: string;
  /** Relevance score (0-1, normalized). */
  relevance: number;
  /** Token count estimate for this evidence. */
  tokenEstimate: number;
  /** Why this evidence was included. */
  inclusionReason: string;
  /** Whether this evidence is from a primary or secondary source. */
  authority: "primary" | "secondary";
}

export interface EvidenceBundle {
  /** The claim this bundle supports. */
  claim: LegalClaim;
  /** Evidence entries for this claim. */
  evidence: EvidenceEntry[];
  /** Total token estimate for this bundle. */
  totalTokens: number;
  /** Token budget allocated to this claim. */
  tokenBudget: number;
  /** Whether the budget was exceeded. */
  budgetExceeded: boolean;
  /** Source diversity score (0-1). */
  sourceDiversity: number;
  /** Sources represented in this bundle. */
  sources: string[];
}

export interface AssembledContext {
  /** All evidence bundles, ordered by claim importance. */
  bundles: EvidenceBundle[];
  /** Flattened evidence entries, ordered by relevance. */
  allEvidence: EvidenceEntry[];
  /** Total token estimate. */
  totalTokens: number;
  /** Total token budget. */
  totalBudget: number;
  /** Explain mode output (if requested). */
  explain?: ExplainOutput;
}

export interface ExplainOutput {
  /** Why each source was included. */
  sourceInclusions: Array<{
    source: string;
    reason: string;
    evidenceCount: number;
  }>;
  /** Why sources were excluded. */
  sourceExclusions: Array<{
    source: string;
    reason: string;
  }>;
  /** Ranking explanation. */
  rankingExplanation: string;
  /** Token budget allocation. */
  budgetAllocation: Array<{
    claimId: string;
    claimText: string;
    budget: number;
    used: number;
  }>;
}

// ── Claim Extraction ──────────────────────────────────────────────────

/**
 * Extract individual legal claims from a complex question.
 *
 * A "claim" is a single legal assertion or sub-question that can be
 * independently researched. Complex questions are decomposed into
 * multiple claims for more targeted retrieval.
 */
export function extractClaims(question: string): LegalClaim[] {
  const claims: LegalClaim[] = [];

  // Split on common German legal question connectors
  // "und", "sowie", "darüber hinaus", "zusätzlich", "ferner"
  // For "und", split when followed by uppercase (new clause) or common question words
  const splitPatterns = [
    /\s+und\s+(?=[A-ZÄÖÜ]|wie\s|was\s|wann\s|warum\s|wo\s|welche[rs]?\s|inwiefern\s|wodurch\s|ist\s|hat\s|kann\s|muss\s|wird\s)/gi,
    /\s+sowie\s+/gi,
    /\s+darüber hinaus\s+/gi,
    /\s+zusätzlich\s+/gi,
    /\s+ferner\s+/gi,
    /\s+außerdem\s+/gi,
  ];

  let parts: string[] = [question];
  for (const pattern of splitPatterns) {
    const newParts: string[] = [];
    for (const part of parts) {
      newParts.push(...part.split(pattern));
    }
    parts = newParts;
  }

  // Also split on "?" if multiple questions are asked
  if (question.includes("?")) {
    const questionParts = question.split(/\?\s*/).filter((p) => p.trim().length > 0);
    if (questionParts.length > 1) {
      parts = questionParts.map((p) => p.trim() + "?");
    }
  }

  // Filter and deduplicate
  const seen = new Set<string>();
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length < 10) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);

    const statutes = extractStatutes(trimmed);
    const concepts = extractConcepts(trimmed);
    const type = classifyClaimType(trimmed);
    const complexity = classifyComplexity(trimmed, statutes, concepts);

    claims.push({
      id: `claim_${claims.length + 1}`,
      text: trimmed,
      type,
      statutes,
      concepts,
      complexity,
    });
  }

  // If only one claim, that's fine — the question is simple
  if (claims.length === 0) {
    claims.push({
      id: "claim_1",
      text: question,
      type: classifyClaimType(question),
      statutes: extractStatutes(question),
      concepts: extractConcepts(question),
      complexity: classifyComplexity(
        question,
        extractStatutes(question),
        extractConcepts(question)
      ),
    });
  }

  return claims;
}

function extractStatutes(text: string): string[] {
  const statutes = new Set<string>();
  const pattern =
    /(?:§+\s*\d+[a-zA-Z]?\s+|Art\.\s*\d+\s*)(BGB|ABGB|HGB|StGB|ZPO|StPO|GG|AO|EStG|UStG|GmbHG|AktG|InsO|FamFG|UWG|GWB|BauGB|VwVfG|SGB|BUrlG|KSchG|BetrVG|BVerfGG|ZVG|OR|ZGB|SchKG|BVG|DSG|DSGVO|EMRK|EUV|AEUV|UGB|ASVG|AVG|GewO|BAO|EheG|KartG|AHG|EO|WEG|MSchG|MRG|AngG|ArbVG|AZG|IO|KStG|VwGVG|VStG|AsylG|JN)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    statutes.add(match[1].toUpperCase());
  }
  return Array.from(statutes);
}

function extractConcepts(text: string): string[] {
  const concepts = new Set<string>();
  const conceptPatterns = [
    /\b(Schadensersatz|Schadenersatz)\b/gi,
    /\b(Gewährleistung|Gewaehrleistung)\b/gi,
    /\b(Rücktritt|Ruecktritt)\b/gi,
    /\b(Verjährung|Verjaehrung)\b/gi,
    /\b(Kündigung|Kuendigung)\b/gi,
    /\b(Schuld|Verbindlichkeit)\b/gi,
    /\b(Eigentum|Besitz)\b/gi,
    /\b(Haftung|Gefährdungshaftung)\b/gi,
    /\b(Vertrag|Vertragsbruch)\b/gi,
    /\b(Untreue|Betrug)\b/gi,
    /\b(Frist|Notfrist)\b/gi,
    /\b(Zuständigkeit|Zustaendigkeit)\b/gi,
    /\b(Beweis|Beweislast)\b/gi,
    /\b(Subsumtion|Subsumption)\b/gi,
    /\b(Verwaltungsakt|Bescheid)\b/gi,
    /\b(Grundrecht|Grundrechte)\b/gi,
    /\b(Datenschutz|DSGVO)\b/gi,
    /\b(Wettbewerbsrecht|Wettbewerbsverstoß)\b/gi,
  ];
  for (const pattern of conceptPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      concepts.add(match[0].toLowerCase());
    }
  }
  return Array.from(concepts);
}

function classifyClaimType(text: string): LegalClaim["type"] {
  const lower = text.toLowerCase();
  // Procedural: Fristen, Zuständigkeit, Verfahren
  if (
    /\b(frist|zuständig|verfahren|prozess|klage|berufung|revision|widerspruch|einspruch)\b/i.test(
      lower
    )
  ) {
    return "procedural";
  }
  // Normative: §-lookup, Gesetzesauslegung
  if (/§|Art\.\s*\d|gesetz|norm|vorschrift|bestimmung/i.test(lower)) {
    return "normative";
  }
  // Factual: case analysis, Sachverhalt
  return "factual";
}

function classifyComplexity(
  text: string,
  statutes: string[],
  concepts: string[]
): LegalClaim["complexity"] {
  let score = 0;
  score += statutes.length * 2;
  score += concepts.length;
  if (text.length > 200) score += 2;
  if (text.length > 400) score += 2;
  if (/\b(allerdings|jedoch|allerdings nur|einschränkend|vorbehaltlich)\b/i.test(text)) score += 2;
  if (text.includes(" und ") || text.includes(" sowie ")) score += 1;

  if (score >= 6) return "complex";
  if (score >= 3) return "moderate";
  return "simple";
}

// ── Token Budget Allocation ───────────────────────────────────────────

export interface TokenBudgetOpts {
  /** Total token budget for all claims. */
  totalBudget: number;
  /** How to distribute budget across claims. */
  strategy: "equal" | "complexity_weighted" | "priority_first";
}

/**
 * Allocate token budget across claims based on the chosen strategy.
 *
 * - "equal": each claim gets an equal share
 * - "complexity_weighted": complex claims get more tokens
 * - "priority_first": first claim gets the most, decreasing after
 */
export function allocateTokenBudget(
  claims: LegalClaim[],
  opts: TokenBudgetOpts
): Map<string, number> {
  const budget = new Map<string, number>();

  if (claims.length === 0) return budget;

  switch (opts.strategy) {
    case "equal": {
      const per = Math.floor(opts.totalBudget / claims.length);
      for (const claim of claims) {
        budget.set(claim.id, per);
      }
      break;
    }
    case "complexity_weighted": {
      const weights = claims.map((c) => {
        switch (c.complexity) {
          case "complex":
            return 3;
          case "moderate":
            return 2;
          case "simple":
            return 1;
        }
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < claims.length; i++) {
        budget.set(claims[i].id, Math.floor((opts.totalBudget * weights[i]) / totalWeight));
      }
      break;
    }
    case "priority_first": {
      // First claim gets 40%, second 30%, third 20%, rest split remaining 10%
      const percentages = [0.4, 0.3, 0.2];
      const remainingPercent = 0.1;
      for (let i = 0; i < claims.length; i++) {
        if (i < 3) {
          budget.set(claims[i].id, Math.floor(opts.totalBudget * percentages[i]));
        } else {
          const remaining = claims.length - 3;
          budget.set(claims[i].id, Math.floor((opts.totalBudget * remainingPercent) / remaining));
        }
      }
      break;
    }
  }

  return budget;
}

// ── Source Diversity ──────────────────────────────────────────────────

/**
 * Calculate source diversity score (0-1).
 *
 * A higher score means evidence comes from more diverse sources.
 * Score = unique_sources / total_evidence (capped at 1.0)
 */
export function calculateSourceDiversity(evidence: EvidenceEntry[]): number {
  if (evidence.length === 0) return 0;
  const sources = new Set(evidence.map((e) => e.sourceType));
  return Math.min(1, sources.size / Math.max(evidence.length, 1));
}

/**
 * Ensure source diversity by capping results per source.
 * If one source dominates, reduce its entries and keep diverse sources.
 */
export function ensureSourceDiversity(
  evidence: EvidenceEntry[],
  maxPerSource: number = 5
): EvidenceEntry[] {
  const bySource = new Map<string, EvidenceEntry[]>();
  for (const entry of evidence) {
    const list = bySource.get(entry.sourceType) ?? [];
    list.push(entry);
    bySource.set(entry.sourceType, list);
  }

  const result: EvidenceEntry[] = [];
  for (const [, list] of bySource) {
    // Sort by relevance within source
    list.sort((a, b) => b.relevance - a.relevance);
    result.push(...list.slice(0, maxPerSource));
  }

  // Re-sort by relevance
  result.sort((a, b) => b.relevance - a.relevance);
  return result;
}

// ── Token Estimation ──────────────────────────────────────────────────

/**
 * Estimate token count for a text string.
 * Rough heuristic: ~4 characters per token for German legal text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Build Evidence Bundle ─────────────────────────────────────────────

export interface BuildBundleOpts {
  /** The claim to build a bundle for. */
  claim: LegalClaim;
  /** Search results for this claim. */
  results: SearchResult[];
  /** Token budget for this claim. */
  tokenBudget: number;
  /** Whether to enable explain mode. */
  explainMode?: boolean;
}

/**
 * Build an evidence bundle for a single claim.
 *
 * Steps:
 * 1. Classify each result by source type and authority
 * 2. Sort by relevance
 * 3. Apply source diversity cap
 * 4. Fit within token budget (drop lowest-relevance entries first)
 */
export function buildEvidenceBundle(opts: BuildBundleOpts): EvidenceBundle {
  const { claim, results, tokenBudget } = opts;

  // Classify results
  let entries: EvidenceEntry[] = results.map((result) => {
    const sourceType = classifySourceType(result);
    const authority = classifyAuthority(result, sourceType);
    const relevance = Math.max(0, Math.min(1, result.score));
    const tokenEstimate = estimateTokens(result.chunk_text ?? result.title ?? "");

    return {
      result,
      claimId: claim.id,
      sourceType,
      relevance,
      tokenEstimate,
      inclusionReason: `Relevance: ${relevance.toFixed(2)}, Source: ${sourceType}`,
      authority,
    };
  });

  // Sort by relevance (primary first, then by score)
  entries.sort((a, b) => {
    if (a.authority !== b.authority) return a.authority === "primary" ? -1 : 1;
    return b.relevance - a.relevance;
  });

  // Apply source diversity
  entries = ensureSourceDiversity(entries, 5);

  // Fit within token budget
  let totalTokens = 0;
  const fitted: EvidenceEntry[] = [];
  for (const entry of entries) {
    if (totalTokens + entry.tokenEstimate > tokenBudget) {
      // Try to fit at least the top entry
      if (fitted.length === 0 && entry.tokenEstimate <= tokenBudget) {
        fitted.push(entry);
        totalTokens += entry.tokenEstimate;
      }
      continue;
    }
    fitted.push(entry);
    totalTokens += entry.tokenEstimate;
  }

  const sources = Array.from(new Set(fitted.map((e) => e.sourceType)));
  const sourceDiversity = calculateSourceDiversity(fitted);

  return {
    claim,
    evidence: fitted,
    totalTokens,
    tokenBudget,
    budgetExceeded: totalTokens > tokenBudget,
    sourceDiversity,
    sources,
  };
}

function classifySourceType(result: SearchResult): string {
  const slug = result.slug ?? "";
  const sourceId = result.source_id ?? "";

  if (slug.startsWith("legal/statutes/") || sourceId.startsWith("law-")) return "statute";
  if (slug.startsWith("legal/judikatur/") || slug.includes("judgement")) return "judgement";
  if (slug.startsWith("legal/materials/")) return "materials";
  if (slug.includes("admin_practice") || slug.includes("erlass")) return "admin_practice";
  if (sourceId && !sourceId.startsWith("law-")) return "firm_knowledge";
  return "unknown";
}

function classifyAuthority(result: SearchResult, sourceType: string): "primary" | "secondary" {
  // Primary sources: statutes, judgements
  if (sourceType === "statute" || sourceType === "judgement") return "primary";
  // Secondary sources: materials, admin practice, firm knowledge
  return "secondary";
}

// ── Assemble Context ──────────────────────────────────────────────────

export interface AssembleContextOpts {
  /** All evidence bundles. */
  bundles: EvidenceBundle[];
  /** Whether to generate explain output. */
  explainMode?: boolean;
  /** Excluded sources with reasons. */
  excludedSources?: Array<{ source: string; reason: string }>;
}

/**
 * Assemble the final context from all evidence bundles.
 *
 * Merges all evidence entries, ordered by claim importance and relevance.
 * Generates explain output if requested.
 */
export function assembleContext(opts: AssembleContextOpts): AssembledContext {
  const { bundles, explainMode, excludedSources } = opts;

  // Flatten all evidence
  const allEvidence: EvidenceEntry[] = [];
  for (const bundle of bundles) {
    allEvidence.push(...bundle.evidence);
  }

  // Sort by claim complexity (complex first) then by relevance
  const complexityOrder = { complex: 0, moderate: 1, simple: 2 };
  allEvidence.sort((a, b) => {
    const bundleA = bundles.find((bu) => bu.claim.id === a.claimId);
    const bundleB = bundles.find((bu) => bu.claim.id === b.claimId);
    if (bundleA && bundleB) {
      const cDiff =
        complexityOrder[bundleA.claim.complexity] - complexityOrder[bundleB.claim.complexity];
      if (cDiff !== 0) return cDiff;
    }
    return b.relevance - a.relevance;
  });

  const totalTokens = allEvidence.reduce((sum, e) => sum + e.tokenEstimate, 0);
  const totalBudget = bundles.reduce((sum, b) => sum + b.tokenBudget, 0);

  let explain: ExplainOutput | undefined;
  if (explainMode) {
    explain = generateExplainOutput(bundles, allEvidence, excludedSources ?? []);
  }

  return {
    bundles,
    allEvidence,
    totalTokens,
    totalBudget,
    explain,
  };
}

function generateExplainOutput(
  bundles: EvidenceBundle[],
  allEvidence: EvidenceEntry[],
  excludedSources: Array<{ source: string; reason: string }>
): ExplainOutput {
  // Source inclusions
  const sourceMap = new Map<string, { reason: string; count: number }>();
  for (const entry of allEvidence) {
    const existing = sourceMap.get(entry.sourceType);
    if (existing) {
      existing.count++;
    } else {
      sourceMap.set(entry.sourceType, {
        reason: entry.inclusionReason,
        count: 1,
      });
    }
  }

  const sourceInclusions = Array.from(sourceMap.entries()).map(([source, info]) => ({
    source,
    reason: info.reason,
    evidenceCount: info.count,
  }));

  // Budget allocation
  const budgetAllocation = bundles.map((b) => ({
    claimId: b.claim.id,
    claimText: b.claim.text.slice(0, 80) + (b.claim.text.length > 80 ? "..." : ""),
    budget: b.tokenBudget,
    used: b.totalTokens,
  }));

  // Ranking explanation
  const primaryCount = allEvidence.filter((e) => e.authority === "primary").length;
  const secondaryCount = allEvidence.filter((e) => e.authority === "secondary").length;
  const rankingExplanation =
    `Ranking: Primary sources (statutes, judgements) ranked first, then secondary sources. ` +
    `${primaryCount} primary, ${secondaryCount} secondary sources. ` +
    `Source diversity applied: max 5 per source type. ` +
    `Token budget: ${allEvidence.reduce((s, e) => s + e.tokenEstimate, 0)} / ${bundles.reduce((s, b) => s + b.tokenBudget, 0)} tokens.`;

  return {
    sourceInclusions,
    sourceExclusions: excludedSources,
    rankingExplanation,
    budgetAllocation,
  };
}
