import { z } from "zod";
import { createHandler, apiError } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { generateDocx } from "@/lib/docx-export";
import { fillTemplateMarkdown } from "@/lib/templates";
import { logAudit } from "@/lib/audit";
import {
  AI_RELEASE_FM_KEY,
  contentHashOf,
  isAiPage,
  pageBody,
  releaseRequiredMessage,
  verifyRelease,
} from "@/lib/ai-release";

export const maxDuration = 60;

const letterheadSchema = z.object({
  firm_name: z.string(),
  address_line_1: z.string(),
  address_line_2: z.string().optional(),
  zip_city: z.string(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  logo_url: z.string().optional(),
  lawyers: z.array(
    z.object({ name: z.string(), title: z.string(), bar_number: z.string().optional() })
  ),
  tax_number: z.string().optional(),
  vat_id: z.string().optional(),
  bank_details: z.object({ iban: z.string(), bic: z.string(), bank_name: z.string() }).optional(),
});

const postSchema = z.object({
  slug: z.string().optional(),
  title: z.string().optional(),
  markdown: z.string().max(500_000).optional(),
  formData: z.record(z.unknown()).optional(),
  /** Aus einer Vorlage befüllt: der Server liest die Vorlage selbst und
   *  befüllt sie — nur so gilt ein Export als Text ohne KI-Anteil. */
  template: z
    .object({
      slug: z.string().min(1).max(300),
      values: z.record(z.string().max(20_000)).default({}),
    })
    .optional(),
  /** Nur noch für gespeicherte Seiten ohne KI-Herkunft relevant; freier
   *  Markdown gilt immer als KI-Text (der Server kann die Herkunft nicht prüfen). */
  ai_generated: z.boolean().optional(),
  /** Signierte Freigabe aus POST /api/ai-output/release für genau diesen Text. */
  release: z.string().max(8_000).optional(),
  /** Kanzlei-Briefpapier für die erste Seite — siehe docx-export.ts. */
  letterhead: letterheadSchema.optional(),
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
    audit: (_ctx, body) => ({
      action: "drafting.export" as const,
      entityType: "document",
      details: {
        hasSlug: Boolean(body.slug),
        hasMarkdown: Boolean(body.markdown),
        hasFormData: Boolean(body.formData),
      },
    }),
  },
  async (ctx, body) => {
    let md: string;
    let caseRef = "";
    // AI origin is decided here, never by the client: free Markdown is always
    // AI text (the server cannot tell otherwise), a stored page says it in its
    // frontmatter, and only a template the server fills itself counts as
    // text without AI.
    let aiOutput: boolean;
    /** The exact text the release must cover. */
    let releasedText: string;
    let storedRelease: unknown;

    if (body.template) {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.template.slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!res) {
        return apiError("engine_unreachable", "Die Vorlage konnte nicht geladen werden.", 503);
      }
      if (!res.ok) return apiError("template_not_found", "Vorlage nicht gefunden", 404);
      const page = (await res.json()) as {
        type?: string;
        status?: string;
        content?: string;
        compiled_truth?: string;
        frontmatter?: Record<string, unknown>;
      };
      const type = page.type ?? page.frontmatter?.type;
      if (type !== "legal_template" || page.status === "tombstoned") {
        return apiError("template_not_found", "Vorlage nicht gefunden", 404);
      }
      const filled = fillTemplateMarkdown(
        String(page.content ?? page.compiled_truth ?? ""),
        body.template.values
      );
      md = buildMarkdownFromDraft(filled, body.title || "Subsumio Dokument", body.formData);
      aiOutput = isAiPage(page.frontmatter);
      releasedText = filled;
    } else if (body.markdown && typeof body.markdown === "string") {
      md = buildMarkdownFromDraft(body.markdown, body.title || "Subsumio Dokument", body.formData);
      aiOutput = true;
      releasedText = body.markdown;
    } else if (body.slug && typeof body.slug === "string") {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(body.slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return Response.json({ error: "page_not_found" }, { status: 404 });
      }
      const page = await res.json();
      md = pageBody(page);
      const fm = page.frontmatter ?? {};
      caseRef = String(fm.case_number ?? fm.case_ref ?? "");
      aiOutput = isAiPage(fm);
      releasedText = md;
      storedRelease = fm[AI_RELEASE_FM_KEY];
    } else {
      return Response.json({ error: "slug or markdown is required" }, { status: 400 });
    }

    if (aiOutput) {
      const expected = { brainId: ctx.brainId, contentHash: contentHashOf(releasedText) };
      let check = verifyRelease(body.release, expected);
      if (!check.ok && storedRelease !== undefined) check = verifyRelease(storedRelease, expected);
      if (!check.ok) {
        void logAudit("ai.output_blocked", "document", {
          brainId: ctx.brainId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          entityId: body.slug,
          details: { action: "export_docx", reason: check.reason, title: body.title },
        });
        return apiError("release_required", releaseRequiredMessage(check.reason), 403, {
          reason: check.reason,
        });
      }
    }

    const title = body.title || "Subsumio Dokument";
    const docx = await generateDocx(md, {
      title,
      caseRef,
      letterhead: body.letterhead,
      // Art. 50 KI-VO: every AI export is marked; a stored non-AI page or a
      // server-filled template may opt out.
      aiGenerated: aiOutput || (!body.template && body.ai_generated !== false),
    });
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
