import { NextResponse } from "next/server";
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { explainRetrieval } from "@/lib/matter-context";
import type { QueryMode } from "@/lib/matter-context-types";

const explainBodySchema = z.object({
  query: z.string().min(1).max(2000),
  answer: z.string().min(1).max(10000),
  mode: z.enum(["conservative", "balanced", "tokenmax"]).optional(),
});

export const maxDuration = 30;
export const dynamic = "force-dynamic";

interface ExplanationResponse {
  reasoning: string;
  sources: Array<{
    slug: string;
    title: string;
    snippet: string;
    score: number;
    source: string;
    source_type?: string;
    search_mode?: string;
  }>;
  confidence: "high" | "medium" | "low";
  legalBasis: string[];
  caveats: string[];
}

function inferConfidence(score: number): "high" | "medium" | "low" {
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function extractLegalBasis(text: string): string[] {
  const basis: string[] = [];
  // Match § X Abs. Y BGB, § X ZPO, etc.
  const patterns = [
    /§\s*\d+[a-z]?(?:\s*Abs\.?\s*\d+)?(?:\s*(?:BGB|ZPO|StGB|HGB|GG|AO|EStG|UStG|GewStG|KStG|ErbStG|BewG|GrEStG|RVG|BRAO|BNotO|ZKG|FamFG|VwGO|SGG|ArbGG))?/gi,
    /Art\.\s*\d+(?:\s*(?:GG|DSGVO|EGBGB|EGV))?/gi,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        if (!basis.includes(m)) basis.push(m);
      }
    }
  }
  return basis;
}

function buildReasoningText(
  query: string,
  answer: string,
  sources: ExplanationResponse["sources"],
  confidence: string
): string {
  const parts: string[] = [];

  parts.push(`Die Antwort wurde auf Basis der Frage "${query.slice(0, 200)}" generiert.`);

  if (sources.length > 0) {
    parts.push(
      `Es wurden ${sources.length} Quellen herangezogen (Top-Score: ${sources[0].score.toFixed(2)}).`
    );
    const sourceTypes = [...new Set(sources.map((s) => s.source_type ?? s.source))];
    parts.push(`Quelltypen: ${sourceTypes.join(", ")}.`);
  } else {
    parts.push(
      "Die Antwort basiert auf dem trainierten Wissen des Modells ohne spezifische Quellen aus dem Brain."
    );
  }

  parts.push(`Konfidenzniveau: ${confidence}.`);

  // Check for hedging language
  const hedgingWords = ["kann", "könnte", "möglichlicherweise", "unter Umständen", "im Regelfall"];
  const hasHedging = hedgingWords.some((w) => answer.toLowerCase().includes(w));
  if (hasHedging) {
    parts.push(
      "Die Antwort enthält abwägende Formulierungen, was auf eine nuancierte Rechtslage hindeutet."
    );
  }

  return parts.join(" ");
}

function buildCaveats(answer: string, sources: ExplanationResponse["sources"]): string[] {
  const caveats: string[] = [];
  if (sources.length === 0) {
    caveats.push("Keine spezifischen Quellen aus dem Brain wurden für diese Antwort herangezogen.");
  }
  if (sources.length > 0 && sources[0].score < 0.5) {
    caveats.push(
      "Die Relevanz-Scores der Quellen sind niedrig — die Antwort sollte mit Vorsicht interpretiert werden."
    );
  }
  if (!answer.includes("§") && !answer.includes("Art.")) {
    caveats.push(
      "Die Antwort enthält keine direkten Gesetzeszitate — eine rechtliche Prüfung wird empfohlen."
    );
  }
  caveats.push("Diese Information ersetzt keine anwaltliche Prüfung.");
  return caveats;
}

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "search",
    body: explainBodySchema,
    audit: (_ctx, body) => {
      const b = body as { mode?: string; query?: string; answer?: string };
      return {
        action: "copilot.explain" as const,
        entityType: "document",
        details: {
          mode: b.mode,
          queryLength: b.query?.length ?? 0,
          hasAnswer: Boolean(b.answer),
        },
      };
    },
  },
  async (ctx, body) => {
    const { query, answer, mode } = body as {
      query: string;
      answer: string;
      mode?: QueryMode;
    };

    try {
      // Get retrieval explanations for the query
      const results = await explainRetrieval(
        query,
        ENGINE_URL,
        engineHeadersForBrain(ctx.brainId),
        mode ?? "balanced"
      );

      const sources: ExplanationResponse["sources"] = results.slice(0, 10).map((r) => ({
        slug: r.slug,
        title: r.title,
        snippet: r.snippet,
        score: r.score,
        source: r.explanation.source,
        source_type: r.explanation.source_type,
        search_mode: r.explanation.search_mode,
      }));

      const topScore = sources.length > 0 ? sources[0].score : 0;
      const confidence = inferConfidence(topScore);
      const legalBasis = extractLegalBasis(answer);
      const reasoning = buildReasoningText(query, answer, sources, confidence);
      const caveats = buildCaveats(answer, sources);

      const explanation: ExplanationResponse = {
        reasoning,
        sources,
        confidence,
        legalBasis,
        caveats,
      };

      return NextResponse.json({ explanation });
    } catch (err) {
      console.error(
        "[copilot/explain] POST failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("internal_error", "Failed to generate explanation", 500);
    }
  }
);
