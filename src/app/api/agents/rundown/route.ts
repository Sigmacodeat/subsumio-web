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

## Datenquellen
- Fristen-Read-Model: Verwende die unified Fristen-Daten (legal_case frontmatter + legal_deadline pages + Fristenbuch). Die Fristen sind bereits klassifiziert mit Status (overdue, critical, warning, vorfrist, pending, done).
- Vier-Augen-Prüfung: Suche nach Fristen mit second_check_required=true, die noch nicht bestätigt sind (second_check_at fehlt).
- Agent-Inbox: Liste alle ausstehenden agent_actions mit status=pending.
- Gestrige Aktivität: Akten, die in den letzten 24 Stunden aktualisiert wurden (neue Dokumente, Queries, Agenten-Läufe).

## Pflicht-Abschnitte (in dieser Reihenfolge)
### 🔴 Fristen heute & kritisch
Heute fällige Fristen (Status overdue/critical) mit Akten-Slug und Frist-Typ. Markiere Notfristen explizit.
### 🔍 Vier-Augen-Kontrollen offen
Fristen mit second_check_required=true, die noch nicht bestätigt wurden. Nenne Akte, Frist-Datum und wer prüfen muss.
### ✅ Agent-Inbox / Freigaben
Ausstehende agent_actions (status=pending) mit Kurzbeschreibung und Akten-Bezug.
### ⚖️ Neue Rechtsprechung
(Leer falls keine neuen Urteile vorliegen — Abschnitt weglassen wenn leer.)
### 📁 Gestrige Aktivität
Akten, die in den letzten 24 Stunden aktualisiert wurden. Kurz: was passierte (Dokument, Query, Agent-Lauf).
### 🎯 Empfehlungen für heute
3-5 priorisierte Handlungsempfehlungen, abgeleitet aus Fristen, offenen Kontrollen und Aktivität.

## Regeln
- Sei präzise und kurz. Verweise immer auf Akten-Slugs.
- Wenn ein Abschnitt leer ist, lasse ihn weg (nicht "nichts zu berichten" schreiben).
- Priorisiere gerichtliche Fristen über vertragliche über interne.
- Markiere Notfristen (is_notfrist=true) mit ⚠️.
- Sprache: Deutsch.`;

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
          budget_remaining_cents: 30,
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
