import { z } from "zod";
import { listEnginePages } from "@/lib/engine-pages";
import { appendDocumentsToMatter, uploadFileToMatter } from "@/lib/email/mail-filing";
import { caseFrontmatter } from "@/lib/legal-types";
import { createHandler, apiError } from "@/lib/api-handler";
import { resolveEmailImport, type EmailHeaders } from "@/lib/email-threading";
import { stampInboundEntryBestEffort } from "@/lib/inbound-register-stamp";

import { logger } from "@/lib/logger";
const log = logger("api/email-import");

export const maxDuration = 60;

/** Largest original .eml accepted (the attachment limit of the mail filing). */
const MAX_RAW_EML_CHARS = 25 * 1024 * 1024;

const emailImportSchema = z.object({
  subject: z.string().min(1, "subject_required").max(2000),
  from: z.string().min(1, "from_required").max(2000),
  body: z.string().min(1, "body_required").max(5_000_000),
  date: z.string().max(200).optional(),
  message_id: z.string().max(2000).optional(),
  in_reply_to: z.string().max(2000).optional(),
  references: z.string().max(20_000).optional(),
  force_case_slug: z.string().max(500).optional(),
  /** The original message (RFC 822) — stored unchanged, attachments included. */
  raw_eml: z.string().max(MAX_RAW_EML_CHARS).optional(),
});

/** One header of an RFC 822 message (unfolded), or undefined. */
function emlHeader(raw: string, name: string): string | undefined {
  const end = raw.search(/\r?\n\r?\n/);
  const head = (end === -1 ? raw : raw.slice(0, end)).replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp(`^${name}:[ \\t]*(.*)$`, "im");
  const m = head.match(re);
  return m?.[1]?.trim() || undefined;
}

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
      // Headers the browser parser does not extract come from the original.
      if (body.raw_eml) {
        body.message_id ??= emlHeader(body.raw_eml, "Message-ID");
        body.in_reply_to ??= emlHeader(body.raw_eml, "In-Reply-To");
        body.references ??= emlHeader(body.raw_eml, "References");
      }
      // Cursor-paginated: listPages stops silently at the 100-row engine cap.
      const pages = await listEnginePages(ctx.headers, "legal_case", 10_000, {
        strict: true,
      });
      const cases = pages.map((p) => ({ slug: p.slug, title: p.title, ...caseFrontmatter(p) }));

      // If user explicitly selected a case (disambiguation), use it directly
      // (cases the user cannot see are not in the list — never silently
      // re-routed to an automatic match).
      if (body.force_case_slug) {
        const forcedCase = cases.find((c) => c.slug === body.force_case_slug);
        if (!forcedCase) {
          return apiError("case_not_found", "Akte nicht gefunden", 404);
        }
        return await importEmailIntoCase(forcedCase, body, undefined, ctx);
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

      return await importEmailIntoCase(matchedCase, body, result.threadId, ctx);
    } catch (err) {
      log.error("[email-import] failed:", err instanceof Error ? err.message : String(err));
      return apiError("import_failed", "E-Mail-Import fehlgeschlagen", 500);
    }
  }
);

/** The mail as a plain-text document when the original is not available. */
function mailAsText(body: z.infer<typeof emailImportSchema>): string {
  return [
    `Von: ${body.from}`,
    body.date ? `Datum: ${body.date}` : null,
    `Betreff: ${body.subject}`,
    body.message_id ? `Message-ID: ${body.message_id}` : null,
    "",
    body.body,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

function mailFilename(subject: string, ext: "eml" | "txt"): string {
  const stem =
    subject
      .replace(/[\\/:*?"<>|\r\n\t]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "E-Mail";
  return `E-Mail ${stem}.${ext}`;
}

async function importEmailIntoCase(
  matchedCase: { slug: string; title: string; case_number?: string; documents?: unknown[] },
  body: z.infer<typeof emailImportSchema>,
  threadId: string | undefined,
  ctx: { headers: Record<string, string>; brainId: string; user: { name?: string; email?: string } }
) {
  const existingDocs = (matchedCase.documents || []) as Array<{
    id?: string;
    name?: string;
    notes?: string;
    thread_id?: string;
    message_id?: string;
  }>;
  const matched = {
    slug: matchedCase.slug,
    caseNumber: matchedCase.case_number,
    title: matchedCase.title,
  };

  const isDuplicate = existingDocs.some((doc) => {
    if (body.message_id && doc.message_id) return doc.message_id === body.message_id;
    const docNotes = doc.notes || "";
    return docNotes.includes(`Von: ${body.from}`) && doc.name === `E-Mail: ${body.subject}`;
  });

  if (isDuplicate) {
    return Response.json({
      success: true,
      duplicate: true,
      threadId,
      matchedCase: matched,
      message: "E-Mail wurde bereits in diese Akte importiert.",
    });
  }

  // The complete mail is stored as its own document of the matter (the
  // original .eml with its attachments when available, otherwise the full
  // text) — never cut down to a preview in the matter's list.
  const content = body.raw_eml
    ? Buffer.from(body.raw_eml, "utf8")
    : Buffer.from(mailAsText(body), "utf8");
  const uploaded = await uploadFileToMatter(
    ctx.brainId,
    matchedCase.slug,
    {
      filename: mailFilename(body.subject, body.raw_eml ? "eml" : "txt"),
      contentType: body.raw_eml ? "message/rfc822" : "text/plain",
      size: content.byteLength,
      content,
    },
    "email"
  );
  if (!uploaded) {
    return apiError(
      "email_not_stored",
      "Die E-Mail konnte nicht in der Akte abgelegt werden — sie liegt dort bereits oder ist zu groß.",
      422
    );
  }
  const documentEntry = {
    ...uploaded,
    name: `E-Mail: ${body.subject}`,
    type: "email",
    uploadedAt: body.date || uploaded.uploadedAt,
    notes: `Von: ${body.from}\n\n${body.body.slice(0, 500)}${body.body.length > 500 ? " …" : ""}`,
    thread_id: threadId,
    message_id: body.message_id,
  };

  // Appended under the matter's document-list lock — concurrent uploads and
  // imports into the same matter all stay in the list.
  const linked = await appendDocumentsToMatter(ctx.brainId, matchedCase.slug, [documentEntry]);
  if (!linked) {
    return apiError(
      "case_link_failed",
      "Die E-Mail wurde gespeichert, konnte aber nicht mit der Akte verknüpft werden.",
      502
    );
  }

  // Posteingangsbuch: importierte E-Mails sind Eingänge — ohne Stempel fehlen
  // sie in der revisionssicheren Übersicht. Best-effort wie beim Upload.
  await stampInboundEntryBestEffort(
    ctx.headers,
    {
      channel: "email",
      subject: body.subject,
      senderAddress: body.from,
      caseSlug: matchedCase.slug,
      receivedBy: ctx.user.name || ctx.user.email,
      notes: threadId ? `Thread: ${threadId}` : undefined,
    },
    ctx.brainId
  );

  return Response.json({
    success: true,
    threadId,
    matchedCase: matched,
    document: documentEntry,
  });
}
