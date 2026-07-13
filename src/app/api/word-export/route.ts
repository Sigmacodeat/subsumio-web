import { z } from "zod";
import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { generateDocx } from "@/lib/docx-export";
import {
  assertOutputActionAllowed,
  VerificationPolicyError,
  buildPolicyOutput,
  type AttorneyOverride,
} from "@/lib/verification-policy";

export const maxDuration = 60;

const overrideSchema = z.object({
  user_id: z.string().min(1),
  reason: z.string().min(10),
  timestamp: z.string().min(1),
  output_hash: z.string().length(64),
});

const verificationSchema = z.object({
  state: z.enum([
    "VERIFIED",
    "VERIFIED_WITH_WARNINGS",
    "NEEDS_HUMAN_REVIEW",
    "BLOCKED",
    "VERIFIER_ERROR",
  ]),
  content_hash: z.string().length(64),
  receipt_hash: z.string().length(64).optional(),
  override: overrideSchema.optional(),
});

const postSchema = z.object({
  slug: z.string().optional(),
  title: z.string().optional(),
  markdown: z.string().max(500_000).optional(),
  formData: z.record(z.unknown()).optional(),
  verification: verificationSchema.optional(),
});

function buildMarkdownFromDraft(
  md: string,
  title: string,
  formData?: Record<string, unknown>
): string {
  let result = `# ${title}\n\n${md}`;
  if (formData) {
    const entries = Object.entries(formData).filter(([, v]) => v != null && v !== "");
    if (entries.length > 0) {
      result += "\n\n---\n\n## Metadaten\n\n";
      for (const [key, value] of entries) {
        result += `- **${key}:** ${String(value)}\n`;
      }
    }
  }
  return result;
}

export const POST = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    body: postSchema,
  },
  async (ctx, body) => {
    // ── Verification policy check (export_docx) ──
    if (body.verification) {
      const output = buildPolicyOutput(
        body.slug || body.title || "docx-export",
        body.verification.state,
        body.verification.content_hash,
        { receipt_hash: body.verification.receipt_hash, title: body.title }
      );
      try {
        await assertOutputActionAllowed(
          output,
          "export_docx",
          { user_id: ctx.user.id, user_email: ctx.user.email, brain_id: ctx.brainId },
          body.verification.override as AttorneyOverride | undefined
        );
      } catch (err) {
        if (err instanceof VerificationPolicyError) {
          return Response.json(
            { error: "verification_denied", reason: err.decision.reason },
            { status: 403 }
          );
        }
        throw err;
      }
    }

    let md: string;
    let caseRef = "";

    if (body.markdown && typeof body.markdown === "string") {
      md = buildMarkdownFromDraft(body.markdown, body.title || "Subsumio Dokument", body.formData);
    } else if (body.slug && typeof body.slug === "string") {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return Response.json({ error: "page_not_found" }, { status: 404 });
      }
      const page = await res.json();
      md = String(page.compiled_truth ?? page.content ?? "");
      const fm = page.frontmatter ?? {};
      caseRef = String(fm.case_number ?? fm.case_ref ?? "");
    } else {
      return Response.json({ error: "slug or markdown is required" }, { status: 400 });
    }

    const title = body.title || "Subsumio Dokument";
    const docx = await generateDocx(md, { title, caseRef });
    const buf = docx.buffer.slice(
      docx.byteOffset,
      docx.byteOffset + docx.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    return new Response(blob, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(title)}.docx"`,
      },
    });
  }
);
