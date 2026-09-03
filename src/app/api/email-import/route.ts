import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import { caseFrontmatter } from "@/lib/legal-types";
import { createHandler, apiError } from "@/lib/api-handler";
import { resolveEmailImport, type EmailHeaders } from "@/lib/email-threading";

export const maxDuration = 60;

const emailImportSchema = z.object({
  subject: z.string().min(1, "subject_required"),
  from: z.string().min(1, "from_required"),
  body: z.string().min(1, "body_required"),
  date: z.string().optional(),
  message_id: z.string().optional(),
  in_reply_to: z.string().optional(),
  references: z.string().optional(),
  force_case_slug: z.string().optional(),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: emailImportSchema,
    audit: (_ctx, body) => ({
      action: "email.import" as const,
      entityType: "email_import",
      details: {
        has_message_id: Boolean(body.message_id),
        has_in_reply_to: Boolean(body.in_reply_to),
        has_references: Boolean(body.references),
        forced_case_slug: body.force_case_slug,
        has_date: Boolean(body.date),
      },
    }),
  },
  async (ctx, body, _query, _req) => {
    try {
      const brain = createServerBrainClient(ctx.headers);
      const pages = await brain.listPages({ type: "legal_case", limit: 500 });
      const cases = pages.map((p) => ({ slug: p.slug, title: p.title, ...caseFrontmatter(p) }));

      // If user explicitly selected a case (disambiguation), use it directly
      if (body.force_case_slug) {
        const forcedCase = cases.find((c) => c.slug === body.force_case_slug);
        if (forcedCase) {
          return await importEmailIntoCase(brain, forcedCase, body);
        }
      }

      const headers: EmailHeaders = {
        subject: body.subject,
        from: body.from,
        body: body.body,
        date: body.date,
        messageId: body.message_id,
        inReplyTo: body.in_reply_to,
        references: body.references,
      };

      const result = resolveEmailImport(headers, cases);

      if (result.status === "no_match") {
        return Response.json({
          success: false,
          error: "no_case_match",
          threadId: result.threadId,
          message: result.message,
          suggestions: cases
            .slice(0, 5)
            .map((c) => ({ slug: c.slug, caseNumber: c.case_number, title: c.title })),
        });
      }

      if (result.status === "ambiguous") {
        return Response.json({
          success: false,
          error: "ambiguous_match",
          threadId: result.threadId,
          message: result.message,
          candidates: result.candidates,
        });
      }

      const matchedCase = cases.find((c) => c.slug === result.matchedCaseSlug);
      if (!matchedCase) {
        return apiError("case_not_found", "Zugeordnete Akte nicht gefunden", 404);
      }

      return await importEmailIntoCase(brain, matchedCase, body, result.threadId);
    } catch (err) {
      console.error("[email-import] failed:", err instanceof Error ? err.message : String(err));
      return apiError("import_failed", "E-Mail-Import fehlgeschlagen", 500);
    }
  }
);

async function importEmailIntoCase(
  brain: ReturnType<typeof createServerBrainClient>,
  matchedCase: { slug: string; title: string; case_number?: string; documents?: unknown[] },
  body: z.infer<typeof emailImportSchema>,
  threadId?: string
) {
  const existingDocs = (matchedCase.documents || []) as Array<{
    id?: string;
    name?: string;
    notes?: string;
    thread_id?: string;
  }>;

  const isDuplicate = existingDocs.some((doc) => {
    const docNotes = doc.notes || "";
    return docNotes.includes(`Von: ${body.from}`) && doc.name === `E-Mail: ${body.subject}`;
  });

  if (isDuplicate) {
    return Response.json({
      success: true,
      duplicate: true,
      threadId,
      matchedCase: {
        slug: matchedCase.slug,
        caseNumber: matchedCase.case_number,
        title: matchedCase.title,
      },
      message: "E-Mail wurde bereits in diese Akte importiert.",
    });
  }

  const documentEntry = {
    id: `doc-${Date.now()}`,
    name: `E-Mail: ${body.subject}`,
    type: "email",
    url: "#email",
    uploadedAt: body.date || new Date().toISOString(),
    notes: `Von: ${body.from}\n\n${body.body.substring(0, 2000)}`,
    thread_id: threadId,
  };

  await brain.updatePage({
    slug: matchedCase.slug,
    frontmatter: {
      documents: [...existingDocs, documentEntry],
    },
  });

  return Response.json({
    success: true,
    threadId,
    matchedCase: {
      slug: matchedCase.slug,
      caseNumber: matchedCase.case_number,
      title: matchedCase.title,
    },
    document: documentEntry,
  });
}
