/**
 * Case-File → Statute Cross-Referencing
 *
 * Analyzes case file facts to extract legal issues, then retrieves
 * relevant statutes using the concept-map + hybrid search.
 *
 * Harvey pattern: understand the case first, identify legal issues,
 * then retrieve the specific statutes that apply — not just keyword
 * matching on the case text.
 *
 * Architecture:
 *   1. analyzeCaseFacts(facts) → LegalIssue[] (LLM extraction)
 *   2. retrieveStatutesForIssues(issues, engine) → SearchResult[]
 *   3. extractDeadlinesFromCase(facts) → DeadlineHint[] (regex + LLM)
 */

import type { BrainEngine } from "../engine.ts";
import type { SearchResult } from "../types.ts";
import { hybridSearch } from "../search/hybrid.ts";
import { expandLegalQuery } from "../think/legal-query-expand.ts";
import { expandConceptQuery, findConceptMappings } from "../legal/concept-map.ts";
import { chat as gatewayChat } from "../ai/gateway.ts";

export interface LegalIssue {
  /** Short description of the legal issue. */
  description: string;
  /** Legal area (e.g. "civil", "criminal", "procedural"). */
  area: string;
  /** Relevant law abbreviation (e.g. "BGB", "StGB"). */
  law?: string;
  /** Relevant §-numbers. */
  sections?: (number | string)[];
  /** Key terms from the case that triggered this issue. */
  keywords: string[];
  /** Confidence 0-1. */
  confidence: number;
}

export interface DeadlineHint {
  /** Deadline description. */
  description: string;
  /** Deadline type (e.g. "berufung", "klagebeantwortung"). */
  type?: string;
  /** Date mentioned in the case, if any. */
  date?: string;
  /** Relevant §-number for the deadline. */
  legalBasis?: string;
}

export interface CaseAnalysis {
  issues: LegalIssue[];
  deadlines: DeadlineHint[];
  jurisdiction: "de" | "at" | "ch" | "eu" | "unknown";
  summary: string;
}

/**
 * Analyze case facts to extract legal issues and deadlines.
 * Uses LLM (DeepSeek utility tier) for extraction.
 */
export async function analyzeCaseFacts(
  facts: string,
  opts?: { jurisdiction?: string; model?: string }
): Promise<CaseAnalysis> {
  const jurisdiction = (opts?.jurisdiction ?? "unknown") as CaseAnalysis["jurisdiction"];

  if (!facts || facts.length < 20) {
    return { issues: [], deadlines: [], jurisdiction, summary: "" };
  }

  try {
    const system = `Du bist ein juristischer Fall-Analyst. Analysiere den Sachverhalt und extrahiere:
1. Rechtliche Probleme (issues) mit relevanten Gesetzen und Paragraphen
2. Fristen (deadlines) falls erwähnt

Antworte als JSON:
{
  "issues": [
    {"description": "...", "area": "civil|criminal|procedural|admin|family", "law": "BGB", "sections": [823], "keywords": ["Schadensersatz", "Haftung"], "confidence": 0.9}
  ],
  "deadlines": [
    {"description": "...", "type": "berufung|klagebeantwortung|verjährung", "date": "2024-01-15", "legalBasis": "§ 517 ZPO"}
  ],
  "summary": "Kurze Zusammenfassung der rechtlichen Probleme"
}`;

    const result = await gatewayChat({
      system,
      messages: [{ role: "user", content: facts.slice(0, 8000) }],
      maxTokens: 1000,
      ...(opts?.model ? { model: opts.model } : {}),
    });

    const text = result.text?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { issues: [], deadlines: [], jurisdiction, summary: "" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 10) : [],
      deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines.slice(0, 5) : [],
      jurisdiction,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch {
    // Fail-open: try heuristic extraction via concept-map
    const mappings = findConceptMappings(facts, jurisdiction as "de" | "at" | undefined);
    const issues: LegalIssue[] = mappings.map(m => ({
      description: m.terms[0],
      area: "unknown",
      law: m.law,
      sections: m.sections,
      keywords: m.terms,
      confidence: 0.5,
    }));
    return { issues, deadlines: [], jurisdiction, summary: "" };
  }
}

/**
 * Retrieve statutes relevant to the identified legal issues.
 * Uses concept-map §-hints + hybrid search for each issue.
 */
export async function retrieveStatutesForIssues(
  issues: LegalIssue[],
  engine: BrainEngine,
  opts?: { jurisdiction?: string; sourceId?: string; sourceIds?: string[]; limit?: number }
): Promise<SearchResult[]> {
  if (issues.length === 0) return [];

  const limit = opts?.limit ?? 20;
  const allResults: SearchResult[] = [];
  const seen = new Set<number>();

  for (const issue of issues) {
    // Build a search query from the issue
    let query = issue.description;
    if (issue.law && issue.sections && issue.sections.length > 0) {
      const sectionStrs = issue.sections.map(s => `§ ${s}`).join(" ");
      query = `${query} ${sectionStrs} ${issue.law}`;
    }
    query = expandConceptQuery(
      expandLegalQuery(query),
      opts?.jurisdiction as "de" | "at" | undefined,
    );

    try {
      const results = await hybridSearch(engine, query, {
        limit: Math.ceil(limit / Math.max(issues.length, 1)) + 5,
        expansion: false,
        jurisdiction: opts?.jurisdiction,
        sourceId: opts?.sourceId,
        sourceIds: opts?.sourceIds,
      });

      for (const r of results) {
        if (r.chunk_id && !seen.has(r.chunk_id)) {
          seen.add(r.chunk_id);
          allResults.push(r);
        }
      }
    } catch {
      // Continue with other issues
    }
  }

  // Sort by score and return top N
  allResults.sort((a, b) => b.score - a.score);
  return allResults.slice(0, limit);
}

/**
 * Full case analysis pipeline: analyze facts → retrieve statutes.
 * Returns both the analysis and the retrieved statute chunks.
 */
export async function analyzeAndRetrieve(
  facts: string,
  engine: BrainEngine,
  opts?: {
    jurisdiction?: string;
    sourceId?: string;
    sourceIds?: string[];
    limit?: number;
    model?: string;
  }
): Promise<{ analysis: CaseAnalysis; statutes: SearchResult[] }> {
  const analysis = await analyzeCaseFacts(facts, {
    jurisdiction: opts?.jurisdiction,
    model: opts?.model,
  });

  const statutes = await retrieveStatutesForIssues(analysis.issues, engine, {
    jurisdiction: opts?.jurisdiction,
    sourceId: opts?.sourceId,
    sourceIds: opts?.sourceIds,
    limit: opts?.limit,
  });

  return { analysis, statutes };
}
