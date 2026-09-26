import { applyCheckResult, runSanctionsCheck } from "@/lib/sanctions/check";
import { z } from "zod";
import { isStaffRole } from "@/lib/team-visibility";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { withKeyedLock } from "@/lib/keyed-lock";
import {
  assessRiskLevel,
  missingForVerification,
  retentionEnd,
  type KYCHistoryEntry,
  type KYCVerification,
} from "@/lib/kyc";

export const dynamic = "force-dynamic";

const SANCTIONS_CLEAR_ROLES: ReadonlySet<string> = new Set(["admin", "lawyer"]);

const fieldsSchema = z.object({
  client_email: z.string().email().optional(),
  party_type: z.enum(["natural", "legal"]).optional(),
  purpose: z.string().max(2000).optional(),
  identification: z
    .object({
      method: z.enum(["persoenlich", "elektronisch", "dritter"]).optional(),
      document_type: z
        .enum(["reisepass", "personalausweis", "fuehrerschein", "sonstiger_lichtbildausweis"])
        .optional(),
      document_number: z.string().max(100).optional(),
      issuing_authority: z.string().max(200).optional(),
      document_valid_until: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      // § 8b Abs. 2 RAO; also narrows the sanctions check.
      birth_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      copy_retained: z.boolean().optional(),
      document_file_slug: z.string().max(500).optional(),
      remote: z.boolean().optional(),
      additional_measures: z.string().max(2000).optional(),
    })
    .optional(),
  register_number: z.string().max(50).optional(),
  wiereg_extract_obtained: z.boolean().optional(),
  wiereg_extract_date: z.string().max(20).optional(),
  beneficial_owners: z
    .array(z.object({ name: z.string().max(200), verified: z.boolean() }))
    .max(50)
    .optional(),
  pep_check: z.boolean().optional(),
  pep_match: z.boolean().optional(),
  pep_note: z.string().max(2000).optional(),
  sanctions_checked: z.boolean().optional(),
  sanctions_source: z.string().max(300).optional(),
  sanctions_hit: z.boolean().optional(),
  risk_assessment: z
    .object({
      is_pep: z.boolean(),
      is_high_risk_country: z.boolean(),
      cash_intensive: z.boolean(),
      complex_ownership: z.boolean(),
      trust_or_company_structure: z.boolean(),
    })
    .optional(),
  notes: z.string().max(5000).optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), fields: fieldsSchema }),
  z.object({ action: z.literal("verify") }),
  z.object({ action: z.literal("sanctions_check") }),
  z.object({ action: z.literal("pep_screen") }),
  z.object({ action: z.literal("fail"), reason: z.string().trim().min(10).max(2000) }),
  // A sanctions hit is cleared only as a documented decision.
  z.object({
    action: z.literal("sanctions_clear"),
    reason: z.string().trim().min(20).max(2000),
  }),
  z.object({
    action: z.literal("mandate_end"),
    ended_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/)
      .optional(),
  }),
]);

async function load(slug: string, headers: Record<string, string>) {
  const res = await fetch(
    `${ENGINE_URL}/api/pages/${slug.split("/").map(encodeURIComponent).join("/")}`,
    {
      headers,
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!res.ok) return null;
  return (await res.json()) as { frontmatter?: KYCVerification; content?: string };
}

export const GET = createHandler(
  { action: "brain.read", rateTier: "standard" },
  async (ctx, _b, _q, req) => {
    if (!isStaffRole(ctx.user.role)) {
      return apiError("forbidden", "Identitätsprüfungen sind nur für die Kanzlei einsehbar.", 403);
    }
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const page = await load(`legal/kyc/${id}`, ctx.headers);
    if (!page?.frontmatter) return apiError("not_found", "Prüfung nicht gefunden", 404);
    return apiSuccess({
      verification: page.frontmatter,
      missing: missingForVerification(page.frontmatter),
    });
  }
);

export const PATCH = createHandler(
  { action: "brain.write", rateTier: "standard", body: bodySchema },
  async (ctx, body, _query, req) => {
    const { id } = await (req as unknown as { params: Promise<{ id: string }> }).params;
    const slug = `legal/kyc/${id}`;
    return withKeyedLock(`kyc:${ctx.brainId}:${id}`, async () => {
      const page = await load(slug, ctx.headers);
      const current = page?.frontmatter;
      if (!current) return apiError("not_found", "Prüfung nicht gefunden", 404);

      const now = new Date().toISOString();
      let next: KYCVerification = { ...current };
      let entry: KYCHistoryEntry;
      let auditAction:
        | "kyc.update"
        | "kyc.verify"
        | "kyc.fail"
        | "kyc.mandate_end"
        | "kyc.sanctions_cleared";

      if (body.action === "update") {
        if (current.status === "verified" || current.status === "failed") {
          return apiError(
            "kyc_closed",
            "Eine abgeschlossene Prüfung wird nicht mehr geändert. Legen Sie bei Änderungen eine neue Prüfung an.",
            409
          );
        }
        const { risk_assessment, identification, ...rest } = body.fields;
        // A sanctions hit is not unticked by an ordinary save: it needs the
        // documented `sanctions_clear` decision.
        if (current.sanctions_hit === true && rest.sanctions_hit === false) {
          return apiError(
            "sanctions_clear_required",
            "Ein Sanktionstreffer kann nur mit Begründung als ausgeräumt erfasst werden.",
            409
          );
        }
        // The result of an automatic list check stays as recorded.
        if (current.sanctions_checked_at) {
          delete rest.sanctions_checked;
          delete rest.sanctions_source;
        }
        next = {
          ...next,
          ...rest,
          identification: identification
            ? { ...current.identification, ...identification }
            : current.identification,
          status: "in_progress",
        };
        if (risk_assessment) {
          const r = assessRiskLevel(risk_assessment);
          next.risk_level = r.level;
          next.risk_factors = r.factors;
          if (risk_assessment.is_pep) next.pep_match = true;
        }
        if (next.pep_match) next.risk_level = "high";
        entry = { at: now, by: ctx.user.email, action: "updated" };
        auditAction = "kyc.update";
      } else if (body.action === "verify") {
        if (current.status === "verified")
          return apiSuccess({ verification: current, missing: [] });
        const missing = missingForVerification(current);
        if (missing.length > 0) {
          // § 8b Abs. 7 RAO: without complete identification no engagement.
          return apiError(
            "kyc_incomplete",
            "Die Identitätsprüfung ist noch nicht vollständig.",
            422,
            { missing }
          );
        }
        next = { ...next, status: "verified", verified_at: now, verified_by: ctx.user.email };
        entry = { at: now, by: ctx.user.email, action: "verified" };
        auditAction = "kyc.verify";
      } else if (body.action === "sanctions_check") {
        const result = await runSanctionsCheck(current, {
          birthDate: current.identification?.birth_date,
        });
        if (!result) {
          return apiError(
            "sanctions_list_missing",
            "Die Sanktionsliste wurde noch nicht geladen. Der Abgleich läuft wöchentlich; bis dahin bitte manuell prüfen.",
            503
          );
        }
        next = { ...next, ...applyCheckResult(result) };
        entry = {
          at: now,
          by: ctx.user.email,
          action: "updated",
          note: result.hits.length
            ? `Sanktionsabgleich: ${result.hits.length} Treffer zu prüfen (${result.source})`
            : `Sanktionsabgleich ohne Treffer (${result.source})`,
        };
        auditAction = "kyc.update";
      } else if (body.action === "pep_screen") {
        const { pepScreen, isPepScreenConfigured } = await import("@/lib/sanctions/pep");
        if (!isPepScreenConfigured()) {
          return apiError(
            "pep_screen_not_configured",
            "Kein PEP-Datenprovider konfiguriert (OPENSANCTIONS_API_KEY). Bitte manuell prüfen und bestätigen.",
            503
          );
        }
        const names = [
          current.client_name,
          ...(current.beneficial_owners ?? []).map((o) => o.name),
        ].filter((n): n is string => Boolean(n?.trim()));
        const result = await pepScreen(names);
        if (!result) {
          return apiError("pep_screen_unavailable", "PEP-Screening nicht verfügbar", 503);
        }
        next = {
          ...next,
          pep_checked_source: result.source,
          pep_checked_at: result.checkedAt,
          pep_candidates: result.results.map((r) => ({
            name: r.name,
            candidates: r.candidates.map((c) => ({
              name: c.name,
              score: c.score,
              countries: c.countries,
            })),
          })),
        };
        const hits = result.results.filter((r) => r.candidates.length > 0).length;
        entry = {
          at: now,
          by: ctx.user.email,
          action: "updated",
          note: hits
            ? `PEP-Screening: ${hits} Name(n) mit Kandidaten (${result.source})`
            : `PEP-Screening ohne Kandidaten (${result.source})`,
        };
        auditAction = "kyc.update";
      } else if (body.action === "sanctions_clear") {
        if (!SANCTIONS_CLEAR_ROLES.has(ctx.user.role)) {
          return apiError(
            "forbidden",
            "Einen Sanktionstreffer räumen nur Anwältinnen/Anwälte oder Administratoren aus.",
            403
          );
        }
        if (current.status === "verified" || current.status === "failed") {
          return apiError(
            "kyc_closed",
            "Eine abgeschlossene Prüfung wird nicht mehr geändert. Legen Sie bei Änderungen eine neue Prüfung an.",
            409
          );
        }
        if (current.sanctions_hit !== true) {
          return apiError("no_sanctions_hit", "Es liegt kein Sanktionstreffer vor.", 409);
        }
        next = {
          ...next,
          sanctions_hit: false,
          sanctions_cleared_at: now,
          sanctions_cleared_by: ctx.user.email,
          sanctions_cleared_reason: body.reason,
        };
        entry = {
          at: now,
          by: ctx.user.email,
          action: "updated",
          note: `Sanktionstreffer ausgeräumt: ${body.reason}`,
        };
        auditAction = "kyc.sanctions_cleared";
      } else if (body.action === "fail") {
        next = { ...next, status: "failed", failed_reason: body.reason };
        entry = { at: now, by: ctx.user.email, action: "failed", note: body.reason };
        auditAction = "kyc.fail";
      } else {
        const ended = body.ended_at ?? now;
        next = { ...next, mandate_ended_at: ended, retain_until: retentionEnd(ended) };
        entry = { at: now, by: ctx.user.email, action: "mandate_ended" };
        auditAction = "kyc.mandate_end";
      }

      next.updated_at = now;
      next.history = [...(current.history ?? []), entry];
      const res = await enginePatchPage(
        ctx.headers,
        {
          slug,
          frontmatter: next as unknown as Record<string, unknown>,
          content: page?.content ?? "",
        },
        { timeoutMs: 15_000 }
      );
      if (!res.ok)
        return apiError("engine_error", "Die Prüfung konnte nicht gespeichert werden", 502);

      void logAudit(auditAction, "kyc_verification", {
        entityId: id,
        brainId: ctx.brainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        details: {
          case: next.case_slug,
          status: next.status,
          risk: next.risk_level,
          ...(auditAction === "kyc.sanctions_cleared"
            ? { reason: next.sanctions_cleared_reason }
            : {}),
        },
      });
      return apiSuccess({ verification: next, missing: missingForVerification(next) });
    });
  }
);
