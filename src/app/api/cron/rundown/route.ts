import { NextRequest } from "next/server";
import { createCronHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { getRecipientsByBrain } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/rundown — Daily Rundown Agent.
 *
 * Runs as a supercronic cron (Hetzner) or manually:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/rundown
 *
 * For each brain (Kanzlei): submits a supervisor job with the Rundown prompt
 * that scans deadlines, open approvals, and recent activity to produce a
 * daily briefing. The job is tagged name="rundown" so the frontend can
 * filter for it on the Reports page.
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

export const GET = createCronHandler(async (_req: NextRequest): Promise<Response> => {
  const recipientsByBrain = await getRecipientsByBrain();
  const brainIds = new Set(recipientsByBrain.keys());

  let submitted = 0;
  let failed = 0;

  for (const brainId of brainIds) {
    try {
      const res = await fetch(`${ENGINE_URL}/api/agents/supervisor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...engineHeadersForBrain(brainId),
        },
        body: JSON.stringify({
          prompt: RUNDOWN_PROMPT,
          name: "rundown",
          force_specialists: ["legal-analyst", "legal-deadline-extractor"],
        }),
      });

      if (res.ok) {
        submitted++;
      } else {
        console.error(`[cron/rundown] brain ${brainId} failed: HTTP ${res.status}`);
        failed++;
      }
    } catch (err) {
      console.error(
        `[cron/rundown] brain ${brainId} error:`,
        err instanceof Error ? err.message : String(err)
      );
      failed++;
    }
  }

  console.log(`[cron/rundown] submitted=${submitted} failed=${failed} brains=${brainIds.size}`);

  return Response.json({ submitted, failed, brains: brainIds.size });
});
