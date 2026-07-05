import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { createAbsence, type AbsenceRecord } from "@/lib/absence";

const createAbsenceSchema = z.object({
  user_email: z.string().email(),
  user_name: z.string().min(1).max(200),
  delegate_email: z.string().email(),
  delegate_name: z.string().min(1).max(200),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  reason: z.string().max(500).optional(),
  auto_route_enabled: z.boolean().default(true),
  notes: z.string().max(2000).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: createAbsenceSchema,
  },
  async (ctx, body) => {
    if (new Date(body.end_date) < new Date(body.start_date)) {
      return apiError("invalid_dates", "Enddatum muss nach Startdatum liegen", 422);
    }

    const absence = createAbsence(body);

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/absences/${absence.id}`,
        title: `Abwesenheit: ${body.user_name} → ${body.delegate_name}`,
        type: "absence_record",
        frontmatter: absence,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({ absence });
  }
);

const listAbsenceQuerySchema = z.object({
  user_email: z.string().email().optional(),
  status: z.enum(["planned", "active", "completed", "cancelled"]).optional(),
});

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    query: listAbsenceQuerySchema,
  },
  async (ctx, _body, query) => {
    const params = new URLSearchParams({ type: "absence_record", limit: "100" });
    const res = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return apiError("engine_error", "Engine request failed", 502);
    const data = await res.json();
    let absences: AbsenceRecord[] = (
      Array.isArray(data) ? data : (data.pages ?? [])
    ) as AbsenceRecord[];

    if (query?.user_email) {
      absences = absences.filter((a) => a.user_email === query.user_email);
    }
    if (query?.status) {
      absences = absences.filter((a) => a.status === query.status);
    }

    return apiSuccess({ absences });
  }
);
