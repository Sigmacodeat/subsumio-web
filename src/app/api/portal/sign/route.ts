import { z } from "zod";
import { createPublicHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { clientIp } from "@/lib/auth/rate-limit";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { resolvePortalAccess } from "@/lib/portal-access";
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
  signer_email: z.string().email().optional(),
  signature_format: z.enum(["canvas_png", "canvas_svg", "typed_name"]),
  signature_data: z.string().min(1).max(500_000),
  signature_paths: z.array(z.string().max(10_000)).max(200).optional(),
});

/** Document types a client may sign in the portal, and the statuses that close them. */
const SIGNABLE_TYPES = new Set(["signature_request", "power_of_attorney"]);
const CLOSED_STATUSES = new Set(["signed", "declined", "expired", "revoked"]);

export const POST = createPublicHandler(
  {
    body: signSchema,
    cors: true,
    rateLimitKey: (req) => `portal-sign:${clientIp(req.headers)}`,
    rateLimitMax: 10,
    rateLimitWindowMs: 60_000,
    audit: (_ctx, body) => ({
      action: "signature.capture" as const,
      entityType: "captured_signature",
      entityId: body.document_slug,
      details: {
        document_type: body.document_type,
        signature_format: body.signature_format,
        channel: "portal",
      },
    }),
  },
  async (req, body) => {
    const access = await resolvePortalAccess(body.token);
    if (access instanceof Response) return access;
    const { headers, caseSlug, payload } = access;

    // The document must exist in THIS firm's brain, belong to THIS matter and
    // still be open — a token for one matter must never sign another document.
    const docRes = await fetch(
      `${ENGINE_URL}/api/pages/${encodeURIComponent(body.document_slug)}`,
      {
        headers,
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!docRes.ok) {
      return apiError("document_not_found", "Dokument nicht gefunden", 404);
    }
    const doc = (await docRes.json()) as {
      type?: string;
      frontmatter?: Record<string, unknown>;
    };
    const fm = doc.frontmatter ?? {};
    if (fm.case_slug !== caseSlug || !SIGNABLE_TYPES.has(String(doc.type ?? ""))) {
      return apiError("document_not_found", "Dokument nicht gefunden", 404);
    }
    if (CLOSED_STATUSES.has(String(fm.status ?? ""))) {
      return apiError(
        "already_signed",
        "Dieses Dokument ist nicht mehr zur Unterschrift offen",
        409
      );
    }

    const input = {
      document_slug: body.document_slug,
      document_type: doc.type as "signature_request" | "power_of_attorney",
      signer_name: body.signer_name,
      signer_email:
        body.signer_email ??
        ((fm.recipient_email ?? fm.client_email) as string | undefined) ??
        undefined,
      signature_format: body.signature_format as SignatureFormat,
      signature_data: body.signature_data,
      signature_paths: body.signature_paths ?? [],
      legal_level: "simple" as const,
      // Evidence for the simple electronic signature (eIDAS Art. 3 Z 10).
      ip_address: clientIp(req.headers),
      user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? undefined,
      brain_id: payload.brain_id,
    };

    const validationError = validateCaptureInput(input);
    if (validationError) {
      return apiError("validation_error", validationError, 400);
    }

    const signature = createCapturedSignature(input);

    const saveRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/signatures/captured/${signature.id}`,
        title: `Signatur: ${signature.signer_name} — ${signature.document_slug}`,
        type: "captured_signature",
        frontmatter: { ...signature, case_slug: caseSlug, channel: "portal" },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!saveRes.ok) {
      return apiError("signature_not_saved", "Unterschrift konnte nicht gespeichert werden", 502);
    }

    const statusRes = await enginePatchPage(
      headers,
      {
        slug: body.document_slug,
        frontmatter: {
          status: "signed",
          signed_at: signature.captured_at,
          signed_by: signature.signer_name,
          signature_id: signature.id,
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

    broadcastPortalVisit(payload.brain_id, {
      caseSlug,
      documentSlug: body.document_slug,
      action: "sign",
      visitedAt: signature.captured_at,
    });

    // The portal token stays valid: it grants access to the whole matter
    // (messages, uploads, further documents), not to this one signature.
    return apiSuccess({ signature });
  }
);
