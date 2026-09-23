import { z } from "zod";
import { logger } from "@/lib/logger";
import { engineThink } from "@/lib/engine-think";
import { ENGINE_URL } from "@/lib/engine";
import { createHandler, apiError, apiSuccess, recordCreditConsumption } from "@/lib/api-handler";
import {
  createPerspektivenPrompt,
  parsePerspektivenOutput,
  isJuryEligible,
  BASE_ROLES,
  type PerspektivenRole,
  type PerspektivenRoleOutput,
  type PerspektivenSession,
} from "@/lib/perspektivenraum-agent";

const log = logger("api/legal/perspektiven-room");

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const dialsSchema = z.object({
  evidenceStrength: z.enum(["schwach", "neutral", "stark"]).default("neutral"),
  opponentPosture: z.enum(["kompromissbereit", "hart"]).default("hart"),
  timePressure: z.enum(["entspannt", "eng"]).default("entspannt"),
});

const requestSchema = z.object({
  case_slug: z.string().min(1, "case_slug_required"),
  dials: dialsSchema.default({
    evidenceStrength: "neutral",
    opponentPosture: "hart",
    timePressure: "entspannt",
  }),
});

interface CaseData {
  title: string;
  frontmatter: Record<string, unknown>;
}

async function runRole(
  role: PerspektivenRole,
  caseSlug: string,
  input: Parameters<typeof createPerspektivenPrompt>[0],
  headers: Record<string, string>
): Promise<PerspektivenRoleOutput> {
  const prompt = createPerspektivenPrompt(input);
  // Throws on engine failure: an empty role output is not a valid perspective.
  const { answer: rawOutput } = await engineThink(headers, {
    query: prompt,
    caseSlug,
    mode: "balanced",
    timeoutMs: 55_000,
  });
  if (!rawOutput.trim()) throw new Error(`empty output for role ${role}`);
  return parsePerspektivenOutput(rawOutput, role);
}

export const POST = createHandler(
  {
    action: "legal.strategy",
    rateTier: "heavy",
    // Four to five grounded reasoning calls (one per role) — a multi-step
    // run, priced like the research agent.
    credits: "agent",
    body: requestSchema,
    audit: (_ctx, body) => ({
      action: "legal.strategy" as const,
      entityType: "perspektiven_session",
      details: { case_slug: body.case_slug },
    }),
  },
  async (ctx, body) => {
    // 1. Fetch case data — same lookup as case-strategy/red-team.
    const encodedSlug = body.case_slug.split("/").map(encodeURIComponent).join("/");
    let caseData: CaseData | null = null;
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return apiError("case_not_found", `Case not found: ${res.status}`, 404);
      caseData = (await res.json()) as CaseData;
    } catch (err) {
      return apiError(
        "engine_unreachable",
        err instanceof Error ? err.message : "Engine nicht erreichbar",
        503
      );
    }
    if (!caseData) return apiError("case_not_found", "Case not found", 404);

    const fm = caseData.frontmatter ?? {};
    const caseTitle = caseData.title || body.case_slug;
    const legalArea = typeof fm.legal_area === "string" ? fm.legal_area : "";
    const court = typeof fm.court === "string" ? fm.court : "";

    const roles: PerspektivenRole[] = isJuryEligible({ legalArea, court })
      ? [...BASE_ROLES, "geschworene"]
      : BASE_ROLES;

    const roleInput = {
      caseTitle,
      caseFacts: typeof fm.facts === "string" ? fm.facts : "",
      caseClaims: Array.isArray(fm.claims) ? fm.claims.join("; ") : "",
      caseDefenses: Array.isArray(fm.defenses) ? fm.defenses.join("; ") : "",
      legalArea,
      dials: body.dials,
    };

    // 2. Run each role as its own grounded call — clean per-role citation
    // attribution, matching CitationPanel's per-answer model rather than
    // one mixed call whose citations can't be traced back to a role.
    let roleResults: PerspektivenRoleOutput[];
    try {
      roleResults = await Promise.all(
        roles.map((role) => runRole(role, body.case_slug, { ...roleInput, role }, ctx.headers))
      );
    } catch (err) {
      log.error(
        "[perspektiven-room] role failed:",
        err instanceof Error ? err.message : String(err)
      );
      return apiError(
        "think_failed",
        "Die Perspektiven-Analyse konnte nicht erstellt werden. Bitte erneut versuchen.",
        503
      );
    }

    // Charged once every role delivered (a failed run is free).
    void recordCreditConsumption(ctx, "agent", body.case_slug);

    const session: PerspektivenSession = {
      id: `perspektiven-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      case_slug: body.case_slug,
      dials: body.dials,
      roles: roleResults,
      created_at: new Date().toISOString(),
    };

    // 3. Persist — same generic page-write pattern as red_team_result;
    // perspektiven_session is not pre-registered in the legal schema pack
    // manifest, matching the existing red_team_result precedent (custom
    // result types are written via the generic page op, not enumerated
    // in the manifest ahead of time).
    try {
      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...ctx.headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: `legal/perspektiven-raum/${session.id}`,
          title: `Perspektivenraum: ${body.case_slug}`,
          type: "perspektiven_session",
          frontmatter: session,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Best-effort persistence — response still carries the session.
    }

    return apiSuccess({ session });
  }
);
