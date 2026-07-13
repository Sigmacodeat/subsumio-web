import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { createEnvelopeAsUser, createEnvelope } from "@/lib/docusign";
import {
  assertOutputActionAllowed,
  VerificationPolicyError,
  buildPolicyOutput,
  type AttorneyOverride,
} from "@/lib/verification-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const signerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  recipientId: z.string().optional(),
  routingOrder: z.string().optional(),
});

const documentSchema = z.object({
  documentBase64: z.string().min(1),
  name: z.string().min(1).max(200),
  documentId: z.string().min(1),
});

const sendEnvelopeSchema = z.object({
  emailSubject: z.string().min(1).max(200),
  emailBlurb: z.string().max(2000).optional(),
  documents: z.array(documentSchema).min(1).max(10),
  recipients: z.object({
    signers: z.array(signerSchema).min(1).max(10),
  }),
  status: z.enum(["sent", "created"]).default("sent"),
  caseSlug: z.string().optional(),
  caseTitle: z.string().optional(),
  verification: z
    .object({
      state: z.enum([
        "VERIFIED",
        "VERIFIED_WITH_WARNINGS",
        "NEEDS_HUMAN_REVIEW",
        "BLOCKED",
        "VERIFIER_ERROR",
      ]),
      content_hash: z.string().length(64),
      receipt_hash: z.string().length(64).optional(),
      override: z
        .object({
          user_id: z.string().min(1),
          reason: z.string().min(10),
          timestamp: z.string().min(1),
          output_hash: z.string().length(64),
        })
        .optional(),
    })
    .optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: sendEnvelopeSchema,
    audit: (ctx, body) => ({
      action: "docusign.send" as const,
      entityType: "envelope",
      details: {
        subject: body.emailSubject,
        signers: body.recipients.signers.length,
        documents: body.documents.length,
        caseSlug: body.caseSlug,
      },
    }),
  },
  async (ctx, body) => {
    // ── Verification policy check (sign) ──
    if (body.verification) {
      const output = buildPolicyOutput(
        body.caseSlug || body.emailSubject || "docusign",
        body.verification.state,
        body.verification.content_hash,
        { receipt_hash: body.verification.receipt_hash, title: body.caseTitle }
      );
      try {
        await assertOutputActionAllowed(
          output,
          "sign",
          { user_id: ctx.user.id, user_email: ctx.user.email, brain_id: ctx.brainId },
          body.verification.override as AttorneyOverride | undefined
        );
      } catch (err) {
        if (err instanceof VerificationPolicyError) {
          return apiError("verification_denied", err.decision.reason, 403);
        }
        throw err;
      }
    }

    const req = {
      emailSubject: body.emailSubject,
      emailBlurb: body.emailBlurb || "",
      documents: body.documents,
      recipients: {
        signers: body.recipients.signers.map((s, i) => ({
          email: s.email,
          name: s.name,
          recipientId: s.recipientId || `signer-${i + 1}`,
          routingOrder: s.routingOrder || String(i + 1),
        })),
      },
      status: body.status,
      metadata: {
        caseSlug: body.caseSlug || "",
        caseTitle: body.caseTitle || "",
        sentBy: ctx.user.email,
      },
    };

    try {
      // Try per-user token first, fall back to service account
      let result;
      try {
        result = await createEnvelopeAsUser(ctx.user.id, req);
      } catch {
        result = await createEnvelope(req);
      }

      return apiSuccess({
        ok: true,
        envelopeId: result.envelopeId,
        status: result.status,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return apiError("docusign_send_failed", `DocuSign Versand fehlgeschlagen: ${msg}`, 502);
    }
  }
);
