import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import {
  createCapturedSignature,
  validateCaptureInput,
  type SignatureFormat,
} from "@/lib/signature-capture";

export const dynamic = "force-dynamic";

const captureSchema = z.object({
  document_slug: z.string().min(1).max(500),
  document_type: z.enum(["signature_request", "power_of_attorney", "legal_document"]),
  signer_name: z.string().min(1).max(300),
  signer_email: z.string().email().optional(),
  signature_format: z.enum(["canvas_png", "canvas_svg", "typed_name", "docusign"]),
  signature_data: z.string().min(1).max(500_000),
  signature_paths: z.array(z.string().max(10_000)).max(200).optional(),
  legal_level: z.enum(["simple", "advanced", "qualified"]).optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "standard",
    body: captureSchema,
    audit: (ctx, body) => ({
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
  async (ctx, body) => {
    const input = {
      document_slug: body.document_slug,
      document_type: body.document_type,
      signer_name: body.signer_name,
      signer_email: body.signer_email,
      signature_format: body.signature_format as SignatureFormat,
      signature_data: body.signature_data,
      signature_paths: body.signature_paths ?? [],
      legal_level: body.legal_level,
      brain_id: ctx.brainId,
    };

    const validationError = validateCaptureInput(input);
    if (validationError) {
      return apiError("validation_error", validationError, 400);
    }

    const signature = createCapturedSignature(input);

    await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/signatures/captured/${signature.id}`,
        title: `Signatur: ${signature.signer_name} — ${signature.document_slug}`,
        type: "captured_signature",
        frontmatter: signature,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return apiSuccess({ signature });
  }
);
