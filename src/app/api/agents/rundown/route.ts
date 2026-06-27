import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

export const maxDuration = 300;

/**
 * POST /api/agents/rundown — Trigger the daily Rundown agent.
 *
 * Submits a supervisor job with a specialized "Rundown" prompt that:
 *  1. Scans all legal_case pages for upcoming deadlines (next 7 days)
 *  2. Lists open approvals / review gaps
 *  3. Summarizes recent agent activity and case progress
 *  4. Provides prioritized recommendations for the day
 *
 * The job is tagged with name="rundown" so the frontend can filter for it.
 */
const RUNDOWN_PROMPT = `Du bist der Subsumio Rundown-Agent. Erstelle das tägliche Kanzlei-Briefing.

## Aufgabe
1. **Fristen-Check**: Durchsuche alle legal_case Pages nach Fristen der nächsten 7 Tage. Priorisiere nach Dringlichkeit (gerichtlich > vertraglich > intern).
2. **Offene Tasks**: Liste alle ausstehenden Freigaben (agent_actions mit status=pending) und Review-Lücken auf.
3. **Akten-Progress**: Fasse zusammen, welche Akten in den letzten 24 Stunden aktiv waren (neue Dokumente, Queries, Agenten-Läufe).
4. **Empfehlungen**: Gib 3-5 priorisierte Handlungsempfehlungen für den Tag, basierend auf Fristen, Offenem und Akten-Status.

## Format
Strukturiere als:
### 📅 Fristen diese Woche
### ✅ Offene Freigaben
### 📁 Kürzlich aktive Akten
### 🎯 Empfehlungen für heute

Sei präzise und kurz. Verweise auf Akten-Slugs wo möglich.`;

export const POST = createHandler(
  {
    action: "agent.write",
    rateTier: "heavy",
    audit: () => ({
      action: "query.submit" as const,
      entityType: "agent_run",
    }),
  },
  async (ctx, _body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/agents/supervisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          prompt: RUNDOWN_PROMPT,
          name: "rundown",
          role: "planning",
          force_specialists: ["legal-analyst", "legal-deadline-extractor"],
          // Hard budget cap: aborts the entire tree once $0.50 is spent.
          budget_remaining_cents: 50,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return Response.json(payload.error ? payload : { error: "rundown_failed" }, {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      return Response.json({ jobId: data.jobId ?? null, success: true });
    } catch (err) {
      console.error(
        "[agents/rundown] submit failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError("engine_unavailable", "Rundown konnte nicht gestartet werden", 503);
    }
  }
);
