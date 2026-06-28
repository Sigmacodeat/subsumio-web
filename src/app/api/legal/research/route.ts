import { z } from "zod";
import { NextRequest } from "next/server";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler } from "@/lib/api-handler";

export const maxDuration = 30;

/**
 * POST /api/legal/research
 *
 * Submits a deep legal research task to the Supervisor agent pipeline.
 * The supervisor decomposes the question into sub-tasks, routes them to
 * legal-researcher specialists, runs iterative retrieval with gap-filling,
 * and synthesises a cited answer.
 *
 * Returns immediately with { jobId } — poll GET /api/agents/:id for status.
 * Budget: 200 cents ($2) per job — enough for 3-5 specialist turns on Sonnet 4.6.
 */

const bodySchema = z.object({
  question: z.string().min(3).max(4000),
  jurisdiction: z.enum(["at", "de", "ch", "eu", "all"]).default("de"),
  case_slugs: z.array(z.string().max(300)).max(10).optional(),
  budget_cents: z.number().int().min(10).max(1000).default(200),
});

function buildResearchPrompt(question: string, jurisdiction: string, caseSlugs?: string[]): string {
  const jurisdictionLabel: Record<string, string> = {
    at: "österreichisches Recht (ABGB, ZPO-AT, StPO-AT, UGB)",
    de: "deutsches Recht (BGB, ZPO, StGB, HGB)",
    ch: "Schweizer Recht (OR, ZGB, SchKG)",
    eu: "EU-Recht (DSGVO, AGB-Richtlinie, Verordnungen)",
    all: "DACH-Rechtsraum (AT/DE/CH) und EU-Recht",
  };
  const jurisdictionNote = jurisdictionLabel[jurisdiction] ?? "DACH-Rechtsraum";

  const caseContext =
    caseSlugs && caseSlugs.length > 0
      ? `\n\n## Aktenkontext\nGrunde deine Recherche auf die folgenden Aktenseiten:\n${caseSlugs.map((s) => `- ${s}`).join("\n")}\nNutze get_page und query um relevante Passagen abzurufen.`
      : "";

  return `Du bist ein Deep-Research-Agent für ${jurisdictionNote}.

## Rechtsfrage
${question}
${caseContext}

## Pflichtschritte
1. **Zerlege** die Frage in 2–4 Teilfragen (z. B. Anspruchsgrundlage, Tatbestand, Rechtsfolge, Ausnahmen).
2. **Recherchiere** jede Teilfrage mit query/search. Nutze Public-Law-Brain für Primärquellen.
3. **Prüfe Lücken**: Widersprüchliche Meinungen oder unklare Rechtslage explizit benennen.
4. **Synthetisiere**: Antwort mit exakten §§, Gesetzesfassungen und Quellenangaben.
5. **Critic-Runde**: Vollständigkeit und Genauigkeit selbst prüfen.

## Ausgabeformat
### Rechtliche Grundlagen
[Primärquellen mit §§ und Fassungsdatum]

### Analyse der Teilfragen
[Strukturierte Analyse mit Zitaten]

### Offene Fragen / Widersprüche
[Falls vorhanden]

### Ergebnis
[Präzise Antwort auf die Ausgangsfrage]

### Quellen
[Alle verwendeten §§, Urteile, Akten]

Diese Information ersetzt keine anwaltliche Prüfung.`;
}

export const POST = createHandler(
  {
    action: "legal.research" as const,
    body: bodySchema,
    audit: (_ctx, body) => ({
      action: "legal.research" as const,
      entityType: "research_job",
      details: {
        jurisdiction: body.jurisdiction,
        questionLength: body.question.length,
        hasCaseContext: Boolean(body.case_slugs?.length),
      },
    }),
  },
  async (ctx, body, _query, req: NextRequest) => {
    const { question, jurisdiction, case_slugs, budget_cents } = body;
    const prompt = buildResearchPrompt(question, jurisdiction, case_slugs);

    const res = await fetch(`${ENGINE_URL}/api/agents/supervisor`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ctx.headers },
      body: JSON.stringify({
        prompt,
        name: "legal-research",
        force_specialists: ["legal-researcher"],
        budget_remaining_cents: budget_cents,
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      console.error("[legal/research] supervisor submit failed:", res.status, payload);
      return Response.json(
        {
          error: "research_submit_failed",
          message: "Research-Agent konnte nicht gestartet werden.",
        },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { jobId?: number; success?: boolean };
    if (!data.jobId) {
      return Response.json(
        { error: "no_job_id", message: "Kein Job-ID vom Supervisor erhalten." },
        { status: 502 }
      );
    }

    // Suppress unused warning — req is required by createHandler signature
    void req;

    return Response.json({
      ok: true,
      jobId: data.jobId,
      poll_url: `/api/agents/${data.jobId}`,
      poll_interval_ms: 3000,
    });
  }
);
