/**
 * deep-analysis — Bulk narrative report across multiple Vault documents.
 *
 * Unlike `tabularReview` (which produces a flat Q&A grid) or `reviewDocument`
 * (which analyses a single document), Deep Analysis reads all specified
 * documents and produces a cohesive narrative report with cross-document
 * insights, themes, and risks — every claim grounded with verbatim citations.
 *
 * Use cases:
 *  - Due diligence: "What liability risks appear across these 50 contracts?"
 *  - Compliance audit: "Which of these documents mention data processing?"
 *  - Portfolio review: "Summarize the key obligations across these agreements"
 */
import type { BrainEngine } from "../engine.ts";
import {
  type LegalLLM,
  asRiskLevel,
  clipText,
  defaultLegalLLM,
  jurisdictionLabel,
  normalizeForMatch,
  tryParseJSON,
} from "./llm-util.ts";

export interface DeepAnalysisCitation {
  slug: string;
  title: string;
  quote: string;
}

export interface DeepAnalysisFinding {
  theme: string;
  description: string;
  risk_level: "low" | "medium" | "high" | "critical";
  affected_documents: string[];
  citations: DeepAnalysisCitation[];
}

export interface DeepAnalysisReport {
  executive_summary: string;
  document_count: number;
  findings: DeepAnalysisFinding[];
  cross_document_patterns: string[];
  overall_risk: "low" | "medium" | "high" | "critical";
  warnings: string[];
  attorney_review_required: true;
}

export interface DeepAnalysisOpts {
  slugs?: string[];
  sourceId?: string;
  sourceIds?: string[];
  prompt?: string;
  jurisdiction?: string;
  maxDocuments?: number;
  maxCharsPerDoc?: number;
  llm?: LegalLLM;
}

const RISK_ORDER = ["low", "medium", "high", "critical"] as const;

function buildSystem(prompt: string, jurisdiction: string, docCount: number): string {
  return `Du bist ein juristischer Analyse-Assistent für Kanzleien (Recht: ${jurisdictionLabel(jurisdiction)}).
Du analysierst ${docCount} Dokumente und erstellst einen zusammenhängenden Bericht.

Aufgabe: ${prompt || "Identifiziere übergreifende Themen, Risiken und Muster über alle Dokumente hinweg."}

Antworte AUSSCHLIESSLICH als JSON-Objekt (keine Prosa drumherum):
{
  "executive_summary": "3-5 Sätze Gesamteinschätzung über alle Dokumente",
  "findings": [
    {
      "theme": "Kurze Themenbezeichnung",
      "description": "Detaillierte Beschreibung des Befunds",
      "risk_level": "low|medium|high|critical",
      "affected_documents": ["slug1", "slug2"],
      "citations": [
        {"slug": "slug1", "title": "Dokumenttitel", "quote": "WÖRTLICHES Zitat aus dem Dokument"}
      ]
    }
  ],
  "cross_document_patterns": ["Muster 1", "Muster 2"],
  "overall_risk": "low|medium|high|critical"
}

HARTE REGELN:
1. Jedes "citations.quote" MUSS WÖRTLICH (Zeichen für Zeichen) im jeweiligen Dokument vorkommen.
2. "affected_documents" muss slugs aus der Eingabe enthalten.
3. Wenn ein Thema nur ein Dokument betrifft, ist es trotzdem valide.
4. Keine erfundenen Zitate — nur was tatsächlich im Text steht.
5. Du triffst keine endgültige rechtliche Bewertung — anwaltliche Prüfung bleibt erforderlich.`;
}

interface DocContent {
  slug: string;
  title: string;
  content: string;
}

async function loadDocuments(
  engine: BrainEngine,
  slugs: string[],
  opts: DeepAnalysisOpts
): Promise<DocContent[]> {
  const maxChars = opts.maxCharsPerDoc ?? 8000;
  const docs: DocContent[] = [];

  for (const slug of slugs) {
    try {
      const page = await engine.getPage(slug, {
        ...(opts.sourceId !== undefined ? { sourceId: opts.sourceId } : {}),
      });
      const content = String(page.compiled_truth ?? page.content ?? "").slice(0, maxChars);
      if (content.trim()) {
        docs.push({ slug, title: String(page.title ?? slug), content });
      }
    } catch {
      // Skip missing/unreadable documents
    }
  }

  return docs;
}

function groundCitations(
  findings: DeepAnalysisFinding[],
  docs: DocContent[]
): { findings: DeepAnalysisFinding[]; dropped: number } {
  const docMap = new Map(docs.map((d) => [d.slug, d]));
  let dropped = 0;

  for (const f of findings) {
    const kept = f.citations.filter((c) => {
      const doc = docMap.get(c.slug);
      if (!doc) {
        dropped++;
        return false;
      }
      const n = normalizeForMatch(c.quote);
      const haystack = normalizeForMatch(doc.content);
      const ok = n.length >= 8 && haystack.includes(n);
      if (!ok) dropped++;
      return ok;
    });
    f.citations = kept;
  }

  return { findings, dropped };
}

export async function deepAnalysis(
  engine: BrainEngine,
  opts: DeepAnalysisOpts
): Promise<DeepAnalysisReport> {
  const warnings: string[] = [];
  const jurisdiction = opts.jurisdiction ?? "all";
  const maxDocs = opts.maxDocuments ?? 25;

  const slugs = (opts.slugs ?? []).slice(0, maxDocs);
  if (slugs.length === 0) {
    warnings.push("NO_DOCUMENTS_PROVIDED");
    return {
      executive_summary: "",
      document_count: 0,
      findings: [],
      cross_document_patterns: [],
      overall_risk: "low",
      warnings,
      attorney_review_required: true,
    };
  }

  const docs = await loadDocuments(engine, slugs, opts);
  if (docs.length === 0) {
    warnings.push("NO_DOCUMENT_CONTENT_FOUND");
    return {
      executive_summary: "",
      document_count: 0,
      findings: [],
      cross_document_patterns: [],
      overall_risk: "low",
      warnings,
      attorney_review_required: true,
    };
  }

  const llm = opts.llm ?? (await defaultLegalLLM());
  if (!llm) {
    warnings.push("NO_LLM_AVAILABLE");
    return {
      executive_summary: "",
      document_count: docs.length,
      findings: [],
      cross_document_patterns: [],
      overall_risk: "low",
      warnings,
      attorney_review_required: true,
    };
  }

  // Build the combined document context
  const docContext = docs
    .map((d) => `--- DOKUMENT: ${d.slug} (${d.title}) ---\n${d.content}`)
    .join("\n\n");

  const { clipped, warning } = clipText(docContext, 48000);
  if (warning) warnings.push(warning);

  const system = buildSystem(opts.prompt ?? "", jurisdiction, docs.length);
  const user = `<dokumente>\n${clipped}\n</dokumente>`;

  let raw: string;
  try {
    raw = await llm({ system, user, maxTokens: 6000 });
  } catch (e) {
    warnings.push(`LLM_CALL_FAILED: ${e instanceof Error ? e.message : "unknown"}`);
    return {
      executive_summary: "",
      document_count: docs.length,
      findings: [],
      cross_document_patterns: [],
      overall_risk: "low",
      warnings,
      attorney_review_required: true,
    };
  }

  const parsed = tryParseJSON(raw);
  if (!parsed) {
    warnings.push("LLM_OUTPUT_NOT_JSON");
    return {
      executive_summary: "",
      document_count: docs.length,
      findings: [],
      cross_document_patterns: [],
      overall_risk: "low",
      warnings,
      attorney_review_required: true,
    };
  }

  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings: DeepAnalysisFinding[] = [];

  for (const raw of rawFindings) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.theme !== "string" || typeof o.description !== "string") continue;

    const citations: DeepAnalysisCitation[] = Array.isArray(o.citations)
      ? (o.citations as unknown[])
          .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
          .map((c) => ({
            slug: String(c.slug ?? ""),
            title: String(c.title ?? ""),
            quote: String(c.quote ?? ""),
          }))
          .filter((c) => c.slug && c.quote)
      : [];

    findings.push({
      theme: o.theme,
      description: o.description,
      risk_level: asRiskLevel(o.risk_level, "low"),
      affected_documents: Array.isArray(o.affected_documents)
        ? (o.affected_documents as unknown[]).filter((s): s is string => typeof s === "string")
        : [],
      citations,
    });
  }

  // Ground citations against actual document content
  const { findings: groundedFindings, dropped } = groundCitations(findings, docs);
  if (dropped > 0) warnings.push(`DROPPED_${dropped}_UNGROUNDED_CITATIONS`);

  const crossDocPatterns = Array.isArray(parsed.cross_document_patterns)
    ? (parsed.cross_document_patterns as unknown[]).filter(
        (s): s is string => typeof s === "string"
      )
    : [];

  const overallFromModel = asRiskLevel(parsed.overall_risk, "low");
  const overallFromFindings = groundedFindings.reduce<(typeof RISK_ORDER)[number]>(
    (max, f) => (RISK_ORDER.indexOf(f.risk_level) > RISK_ORDER.indexOf(max) ? f.risk_level : max),
    "low"
  );
  const overall_risk =
    RISK_ORDER.indexOf(overallFromModel) >= RISK_ORDER.indexOf(overallFromFindings)
      ? overallFromModel
      : overallFromFindings;

  return {
    executive_summary: typeof parsed.executive_summary === "string" ? parsed.executive_summary : "",
    document_count: docs.length,
    findings: groundedFindings,
    cross_document_patterns: crossDocPatterns,
    overall_risk,
    warnings,
    attorney_review_required: true,
  };
}
