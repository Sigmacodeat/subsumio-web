import { createHash } from "node:crypto";
import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { GUARD_READ_FAILED, readCurrentPage, rejectionResponse } from "@/lib/page-write-guards";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  createFilingPackage,
  createFilingDocument,
  validateFilingPackage,
} from "@/lib/efiling-architecture";
import { buildBeAExportPackage, type XJustizMetadata } from "@/lib/xjustiz";
import { logAudit } from "@/lib/audit";
import { hasCourtName, resolveFilingSender } from "@/lib/bea-send-guard";

const documentSchema = z.object({
  title: z.string().min(1).max(300),
  file_path: z.string().min(1).max(500),
  mime_type: z.string().min(1).max(100),
  size_bytes: z.number().int().min(1),
  file_hash: z.string().min(1).max(128),
  is_main_document: z.boolean().default(false),
});

const beaExportSchema = z.object({
  case_slug: z.string().min(1).max(300),
  court: z.string().min(1).max(300),
  case_number: z.string().max(200).optional(),
  subject: z.string().min(1).max(500),
  // Ignored: the sender always comes from the firm settings.
  sender_name: z.string().max(300).optional(),
  sender_id: z.string().max(200).optional(),
  priority: z.enum(["normal", "urgent", "fristgebunden"]).default("normal"),
  deadline_date: z.string().optional(),
  deadline_id: z.string().max(200).optional(),
  documents: z.array(documentSchema).min(1).max(20).optional(),
  /** Export the text of this beA draft as the main document (size and hash from the stored text). */
  draft_slug: z
    .string()
    .min(1)
    .max(300)
    .regex(/^legal\/bea-drafts\//, "invalid_draft_slug")
    .optional(),
});

type ExportDocument = z.infer<typeof documentSchema>;

/**
 * The main document of a draft export: the draft's stored text, with its
 * real byte size and SHA-256 — never a placeholder.
 */
async function draftDocument(
  headers: Record<string, string>,
  draftSlug: string,
  title: string
): Promise<ExportDocument | Response> {
  const read = await readCurrentPage(ENGINE_URL, headers, draftSlug);
  if (read.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
  if (read.kind === "missing") return apiError("draft_not_found", "Entwurf nicht gefunden", 404);
  const text = String((read.page as { content?: unknown }).content ?? "");
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length === 0) {
    return apiError("draft_empty", "Der Entwurf hat keinen Text — nichts zu exportieren.", 422);
  }
  return {
    title,
    file_path: draftSlug,
    mime_type: "text/plain; charset=utf-8",
    size_bytes: bytes.length,
    file_hash: createHash("sha256").update(bytes).digest("hex"),
    is_main_document: true,
  };
}

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    body: beaExportSchema,
    audit: (ctx, body) => ({
      action: "connector.sync" as const,
      entityType: "bea_export",
      entityId: body.case_slug,
      details: {
        court: body.court,
        caseNumber: body.case_number,
        documentCount: body.documents?.length ?? (body.draft_slug ? 1 : 0),
        priority: body.priority,
      },
    }),
  },
  async (ctx, body) => {
    if (!hasCourtName(body.court)) {
      return apiError("court_missing", "Bitte das empfangende Gericht angeben", 422);
    }
    const sender = await resolveFilingSender(ctx.brainId, process.env.BEA_SENDER_ID);
    if (sender instanceof Response) return sender;

    let documents: ExportDocument[];
    if (body.documents?.length) {
      documents = body.documents;
    } else if (body.draft_slug) {
      const doc = await draftDocument(ctx.headers, body.draft_slug, body.subject);
      if (doc instanceof Response) return doc;
      documents = [doc];
    } else {
      return apiError("documents_missing", "Keine Dokumente für den Export angegeben", 422);
    }

    // 1. Build FilingPackage
    const pkg = createFilingPackage({
      case_slug: body.case_slug,
      brain_id: ctx.brainId,
      org_id: ctx.brainId,
      channel: "beA",
      priority: body.priority,
      court: body.court,
      court_case_number: body.case_number,
      deadline_id: body.deadline_id,
      deadline_date: body.deadline_date,
      created_by: ctx.user.email,
    });

    // 2. Add documents
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      pkg.documents.push(
        createFilingDocument({
          title: doc.title,
          file_path: doc.file_path,
          file_hash: doc.file_hash,
          mime_type: doc.mime_type,
          size_bytes: doc.size_bytes,
          is_main_document: doc.is_main_document,
          sort_order: i,
        })
      );
    }

    // 3. Validate
    const validation = validateFilingPackage(pkg);
    if (!validation.valid) {
      return apiError("filing_validation_failed", "Validierung fehlgeschlagen", 422, {
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    // 4. Build XJustiz export
    const metadata: XJustizMetadata = {
      court: body.court,
      caseNumber: body.case_number,
      senderName: sender.name,
      senderRole: "lawyer",
      senderId: sender.id,
      subject: body.subject,
      priority: body.priority,
      deadlineDate: body.deadline_date,
    };

    const exportPackage = buildBeAExportPackage(pkg, metadata);

    // 5. Log audit
    await logAudit("connector.sync", "bea_export", {
      entityId: pkg.id,
      brainId: ctx.brainId,
      details: {
        court: body.court,
        caseNumber: body.case_number,
        documentCount: documents.length,
        validationHash: exportPackage.manifest.validationHash,
      },
    });

    return apiSuccess({
      filingId: pkg.id,
      xml: exportPackage.xml,
      manifest: exportPackage.manifest,
      validation: {
        valid: validation.valid,
        warnings: validation.warnings,
      },
      instructions:
        "Laden Sie das XML-Package herunter und laden Sie es im beA-Portal hoch. " +
        "Bestätigen Sie nach dem Upload die Empfangsbestätigung im System.",
    });
  }
);
