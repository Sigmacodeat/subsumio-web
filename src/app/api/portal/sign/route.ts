import { z } from "zod";
import { createPublicHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { verifyPortalToken, revokePortalToken } from "@/lib/portal-token";
import { clientIp } from "@/lib/auth/rate-limit";
import { ENGINE_URL } from "@/lib/engine";
import {
  createCapturedSignature,
  validateCaptureInput,
  type SignatureFormat,
} from "@/lib/signature-capture";
import { broadcastPortalVisit } from "@/lib/realtime-bus";

const signSchema = z.object({
  token: z.string().min(1, "token_required"),
  document_slug: z.string().min(1).max(500),
  document_type: z.enum(["signature_request", "power_of_attorney", "legal_document"]),
  signer_name: z.string().min(2).max(300),
  signer_email: z.string().email(),
  signature_format: z.enum(["canvas_png", "canvas_svg", "typed_name"]),
  signature_data: z.string().min(1).max(500_000),
  signature_paths: z.array(z.string().max(10_000)).max(200).optional(),
});

export const POST = createPublicHandler(
  {
    body: signSchema,
    cors: true,
    rateLimitKey: (req) => `portal-sign:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 60_000,
  },
  async (req, body) => {
    const payload = await verifyPortalToken(body.token);
    if (!payload) {
      return apiError("invalid_or_expired_token", "Token ungültig oder abgelaufen", 403);
    }

    const input = {
      document_slug: body.document_slug,
      document_type: body.document_type,
      signer_name: body.signer_name,
      signer_email: body.signer_email,
      signature_format: body.signature_format as SignatureFormat,
      signature_data: body.signature_data,
      signature_paths: body.signature_paths ?? [],
      legal_level: "simple" as const,
    };

    const validationError = validateCaptureInput(input);
    if (validationError) {
      return apiError("validation_error", validationError, 400);
    }

    // Check if already signed (idempotency)
    const existingRes = await fetch(
      `${ENGINE_URL}/api/pages?type=captured_signature&limit=500`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (existingRes.ok) {
      const existingData = await existingRes.json();
      const existingPages: Array<{
        frontmatter: { document_slug: string };
      }> = Array.isArray(existingData) ? existingData : (existingData.pages ?? []);
      const alreadySigned = existingPages.some(
        (p) => p.frontmatter?.document_slug === body.document_slug
      );
      if (alreadySigned) {
        return apiError(
          "already_signed",
          "Dieses Dokument wurde bereits unterschrieben",
          409
        );
      }
    }

    const signature = createCapturedSignature(input);

    // Save the captured signature
    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/signatures/captured/${signature.id}`,
        title: `Signatur: ${signature.signer_name} — ${signature.document_slug}`,
        type: "captured_signature",
        frontmatter: signature,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    // Update the document status to "signed"
    await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.document_slug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frontmatter: {
          status: "signed",
          signed_at: signature.captured_at,
          signed_by: signature.signer_name,
          signature_id: signature.id,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    // Broadcast signature event to the firm (realtime SSE)
    if (payload.brain_id) {
      broadcastPortalVisit(payload.brain_id, {
        caseSlug: payload.case_slug,
        documentSlug: body.document_slug,
        action: "sign",
        visitedAt: signature.captured_at,
      });
    }

    // Revoke the portal token — document is signed, no further access needed
    await revokePortalToken(body.token);

    return apiSuccess({ signature });
  }
);
