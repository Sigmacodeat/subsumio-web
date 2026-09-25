/**
 * POST /api/auth/legal-acceptance — the one-time confirmation of AGB,
 * Datenschutzerklärung and (for firm administrators) the AVV by an existing
 * account, or after a text changed. Called from the blocking dialog in the
 * dashboard (src/components/dashboard/legal-acceptance-gate.tsx).
 *
 * Versions and time are set by the server (src/lib/auth/legal-acceptance.ts);
 * the client only confirms. The versions the dialog showed must match the
 * current ones, so a text that changed while the dialog was open is not
 * recorded as accepted.
 */
import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { getStore } from "@/lib/auth/store";
import {
  LEGAL_VERSIONS,
  bindsFirm,
  buildLegalAcceptance,
  legalAcceptancePatch,
} from "@/lib/auth/legal-acceptance";
import { logAudit } from "@/lib/audit";
import { clientIp } from "@/lib/auth/rate-limit";

const bodySchema = z.object({
  acceptTerms: z.literal(true),
  /** Required when the account binds the firm (administrator). */
  acceptDpa: z.boolean().optional(),
  versions: z.object({
    terms: z.string().max(40),
    privacy: z.string().max(40),
    dpa: z.string().max(40),
  }),
});

export const POST = createHandler(
  {
    // Own account only (ctx.user.id), every role.
    action: "profile.update",
    body: bodySchema,
  },
  async (ctx, body, _query, req) => {
    // Demo visitors and platform operators in a support session never
    // conclude a contract on a firm's behalf.
    if (ctx.demo || ctx.supportSession) {
      return apiError("forbidden", "Not available in this session", 403);
    }
    if (
      body.versions.terms !== LEGAL_VERSIONS.terms ||
      body.versions.privacy !== LEGAL_VERSIONS.privacy ||
      body.versions.dpa !== LEGAL_VERSIONS.dpa
    ) {
      return apiError("legal_version_changed", "The legal texts have changed; please reload", 409);
    }
    if (bindsFirm(ctx.user) && body.acceptDpa !== true) {
      return apiError("dpa_not_accepted", "The AVV must be accepted", 400);
    }

    const store = getStore();
    const record = buildLegalAcceptance(ctx.user, "prompt");
    const updated = await store.update(ctx.user.id, legalAcceptancePatch(ctx.user, record));
    if (!updated) return apiError("user_not_found", "User not found", 404);

    await logAudit("user.legal_accepted", "user", {
      brainId: ctx.brainId,
      entityId: ctx.user.id,
      userId: ctx.user.id,
      userEmail: ctx.user.email,
      ip: clientIp(req.headers),
      details: { ...record },
    });

    return Response.json({ ok: true, legalAcceptance: record });
  }
);
