import { z } from "zod";
import { createHandler, recordCreditConsumption, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";

import { logger } from "@/lib/logger";
const log = logger("api/agents/next-steps");

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/agents/next-steps — Per-case "Nächste Schritte" agent run (WP-5.25).
 *
 * Submits a supervisor job scoped to one legal case. The job name carries the
 * case slug (`next-steps:<slug>`) so `GET /api/agents?filter=next-steps&case=<slug>`
 * can list the runs for exactly this matter.
 */
const NEXT_STEPS_PROMPT = `Du bist der Subsumio „Nächste Schritte"-Agent für die Akte „{case_slug}".

## Aufgabe
Analysiere den aktuellen Stand dieser Akte und leite die konkreten nächsten
Schritte ab. Nutze ausschließlich Daten aus dieser Akte und ihren verknüpften
Seiten (Fristen, Aufgaben, Dokumente, Kommunikation, Kontakte).

## Pflicht-Prüfungen (in dieser Reihenfolge)
1. **Offene Fristen** der Akte: Fälligkeit, Status (overdue/critical/pending),
   Notfristen (is_notfrist=true) zuerst. Vier-Augen-Fristen ohne
   second_check_at explizit markieren.
2. **Offene Aufgaben** der Akte (task-Pages mit case_slug={case_slug}):
   überfällige zuerst, dann nach Priorität.
3. **Unerledigte Kommunikation**: unbeantwortete Posteingänge/Portal-Nachrichten.
4. **Lücken**: fehlende Dokumente (document_request mit status=pending),
   fehlende Mandanten-Kontaktdaten, ausstehende Signaturen.

## Ausgabe-Format (Markdown, Deutsch)
### ⚠️ Sofort (Frist/Notfrist)
… oder Abschnitt weglassen wenn leer
### 📋 Diese Woche
…
### 🗓️ Danach
…

## Regeln
- Jede Empfehlung mit konkreter Begründung („Frist X läuft am Y ab").
- Keine generischen Ratschläge („Akte prüfen") — nur ableitbare Schritte.
- Keine erfundenen Fristen: nur Daten, die du in den Seiten findest.
- Maximal 10 Schritte gesamt.`;

const bodySchema = z.object({
  case_slug: z.string().min(1).max(200),
});

export const POST = createHandler(
  {
    action: "agent.write",
    rateTier: "heavy",
    credits: "agent",
    body: bodySchema,
    audit: (ctx, body) => ({
      action: "agent.supervisor_run" as const,
      entityType: "agent_run",
      details: { user: ctx.user.email, kind: "next_steps", case: body.case_slug },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const res = await fetch(`${ENGINE_URL}/api/agents/supervisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...ctx.headers },
        body: JSON.stringify({
          prompt: NEXT_STEPS_PROMPT.replaceAll("{case_slug}", body.case_slug),
          name: `next-steps:${body.case_slug}`,
          // Binds the run to this matter: the engine checks the caller may
          // see it and loads its context (never guessed from the prompt).
          case_slug: body.case_slug,
          role: "planning",
          budget_remaining_cents: 20,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return Response.json(payload.error ? payload : { error: "next_steps_failed" }, {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      void recordCreditConsumption(ctx, "agent");
      return Response.json({ jobId: data.jobId ?? null, success: true });
    } catch (err) {
      log.error(
        "[agents/next-steps] submit failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError(
        "engine_unavailable",
        "Nächste-Schritte-Lauf konnte nicht gestartet werden",
        503
      );
    }
  }
);
