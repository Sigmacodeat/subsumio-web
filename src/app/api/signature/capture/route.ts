import { createHash } from "node:crypto";
import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import {
  createCapturedSignature,
  validateCaptureInput,
  type SignatureFormat,
} from "@/lib/signature-capture";

export const dynamic = "force-dynamic";

const CLOSED_STATUSES = new Set(["signed", "declined", "expired", "revoked"]);

const captureSchema = z.object({
  document_slug: z.string().min(1).max(500),
  document_type: z.enum(["signature_request", "power_of_attorney", "legal_document"]),
  signer_name: z.string().min(1).max(300),
  signer_email: z.string().email().optional(),
  // Drawn or typed on screen. Provider signatures (DocuSign) arrive through
  // their own flow, never through this route.
  signature_format: z.enum(["canvas_png", "canvas_svg", "typed_name"]),
  signature_data: z.string().min(1).max(500_000),
  signature_paths: z.array(z.string().max(10_000)).max(200).optional(),
});

/**
 * Records a drawn or typed signature in the office. The level is always a
 * simple electronic signature (eIDAS Art. 3 Z 10) — the browser cannot claim
 * an advanced or qualified one. The signed document is marked as signed.
 */
export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: captureSchema,
    audit: (_ctx, body) => ({
      action: "signature.capture" as const,
      entityType: body.document_type,
      entityId: body.document_slug,
      details: {
        signer: body.signer_name,
        format: body.signature_format,
        document: body.document_slug,
      },
    }),
  },
  async (ctx, body, _query, req) => {
    const docRes = await fetch(
      `${ENGINE_URL}/api/pages/${body.document_slug.split("/").map(encodeURIComponent).join("/")}`,
      { headers: ctx.headers, signal: AbortSignal.timeout(10_000) }
    );
    if (!docRes.ok) return apiError("document_not_found", "Dokument nicht gefunden", 404);
    const doc = (await docRes.json()) as { frontmatter?: Record<string, unknown> };
    const fm = doc.frontmatter ?? {};
    if (CLOSED_STATUSES.has(String(fm.status ?? ""))) {
      return apiError(
        "already_signed",
        "Dieses Dokument ist nicht mehr zur Unterschrift offen",
        409
      );
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
      ip_address: req ? clientIp(req.headers) : undefined,
      user_agent: req?.headers.get("user-agent")?.slice(0, 500) ?? undefined,
      brain_id: ctx.brainId,
    };
    const validationError = validateCaptureInput(input);
    if (validationError) return apiError("validation_error", validationError, 400);

    // Deterministic id/slug per (brain, document): a double-submitted signing
    // upserts the same captured_signature page instead of duplicating it.
    const signatureId = `sig-${createHash("sha256")
      .update(`${ctx.brainId}:${body.document_slug}`)
      .digest("hex")
      .slice(0, 20)}`;
    const signature = { ...createCapturedSignature(input), id: signatureId };
    const saveRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/signatures/captured/${signature.id}`,
        title: `Signatur: ${signature.signer_name} — ${signature.document_slug}`,
        type: "captured_signature",
        frontmatter: {
          ...signature,
          case_slug: fm.case_slug,
          channel: "kanzlei",
          recorded_by: ctx.user.email,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!saveRes.ok) {
      return apiError("signature_not_saved", "Unterschrift konnte nicht gespeichert werden", 502);
    }

    const statusRes = await enginePatchPage(
      ctx.headers,
      {
        slug: body.document_slug,
        frontmatter: {
          status: "signed",
          signed_at: signature.captured_at,
          signed_by: signature.signer_name,
          signature_id: signature.id,
          signature_level: "simple",
        },
      },
      { timeoutMs: 10_000 }
    );
    if (!statusRes.ok) {
      return apiError(
        "status_not_updated",
        "Unterschrift gespeichert, Dokumentstatus konnte nicht aktualisiert werden",
        502
      );
    }
    return apiSuccess({ signature });
  }
);
