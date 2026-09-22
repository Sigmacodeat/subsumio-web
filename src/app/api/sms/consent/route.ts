import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { getSmsConsentStore, type SmsConsent } from "@/lib/sms/consent-store";
import { normalizePhone } from "@/lib/whatsapp/types";
import { phoneHash } from "@/lib/whatsapp/verify";
import { logAudit } from "@/lib/audit";
import { randomUUID } from "node:crypto";

const scopeEnum = z.enum([
  "daily_briefing",
  "deadline_alert",
  "approval_request",
  "conflict_alert",
  "new_document",
  "client_reminder",
  "appointment_reminder",
]);

const consentSchema = z.object({
  phone: z.string().min(5).max(30),
  scopes: z.array(scopeEnum).min(1).max(10),
  subjectType: z.enum(["lawyer", "client"]).default("client"),
  subjectRef: z.string().min(1).max(200),
  /** DSGVO proof: how/where the opt-in was obtained (mandatory). */
  proof: z.record(z.unknown()),
  /** Revoke instead of grant. */
  revoke: z.boolean().optional(),
});

/**
 * POST /api/sms/consent — record or revoke an SMS opt-in.
 * Staff document client consent here (e.g. signed engagement letter);
 * revocation sets opt_out_at, which wins over any opt-in.
 */
export const POST = createHandler(
  { action: "agent.write", rateTier: "standard", body: consentSchema },
  async (ctx, body) => {
    // Einwilligung ohne dokumentierten Beleg ist vor DSGVO/BAO nicht
    // haltbar — `proof.basis` ist für Grants Pflicht (Widerruf nicht).
    const basis = body.proof.basis;
    if (!body.revoke && (typeof basis !== "string" || !basis.trim())) {
      return apiError(
        "consent_proof_required",
        "Nachweis der Einwilligung fehlt (proof.basis)",
        400
      );
    }

    const hash = phoneHash(normalizePhone(body.phone));
    const store = getSmsConsentStore();
    const now = new Date().toISOString();
    const existing = (await store.getByPhoneHash(hash)).find(
      (c) => c.subjectRef === body.subjectRef
    );

    if (body.revoke) {
      if (!existing) return apiError("consent_not_found", "Kein Opt-in für diesen Kontakt", 404);
      await store.update(existing.id, { optOutAt: now });
      await logAudit("sms.consent_revoked", "sms_consent", {
        brainId: ctx.brainId,
        details: { phoneHash: hash, subjectRef: body.subjectRef },
      });
      return Response.json({ ok: true, revoked: true });
    }

    const record: SmsConsent = {
      id: existing?.id ?? `smscons_${randomUUID()}`,
      orgId: ctx.user.orgId || ctx.brainId,
      subjectType: body.subjectType,
      subjectRef: body.subjectRef,
      phoneHash: hash,
      scopes: body.scopes,
      optInAt: now,
      optOutAt: null,
      consentProof: { ...body.proof, recorded_by: ctx.user.email, recorded_at: now },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing) await store.update(existing.id, record);
    else await store.create(record);
    await logAudit("sms.consent_granted", "sms_consent", {
      brainId: ctx.brainId,
      details: { phoneHash: hash, subjectRef: body.subjectRef, scopes: body.scopes },
    });
    return Response.json({ ok: true, id: record.id });
  }
);

/** GET /api/sms/consent?phone=… — list active consents for a number (hash-only response). */
export const GET = createHandler(
  {
    action: "agent.read",
    rateTier: "standard",
    query: z.object({ phone: z.string().min(5).max(30) }),
  },
  async (_ctx, _body, query) => {
    const hash = phoneHash(normalizePhone(query.phone));
    const rows = await getSmsConsentStore().getByPhoneHash(hash);
    return Response.json({
      consents: rows.map((c) => ({
        id: c.id,
        subjectRef: c.subjectRef,
        scopes: c.scopes,
        active: !!c.optInAt && !c.optOutAt,
        optInAt: c.optInAt,
        optOutAt: c.optOutAt,
      })),
    });
  }
);
