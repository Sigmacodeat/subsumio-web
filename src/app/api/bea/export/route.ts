import { z } from "zod";
import { createHandler, apiSuccess, apiError } from "@/lib/api-handler";
import {
  createFilingPackage,
  createFilingDocument,
  validateFilingPackage,
} from "@/lib/efiling-architecture";
import { buildBeAExportPackage, type XJustizMetadata } from "@/lib/xjustiz";
import { logAudit } from "@/lib/audit";

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
  sender_name: z.string().min(1).max(300),
  sender_id: z.string().max(200).optional(),
  priority: z.enum(["normal", "urgent", "fristgebunden"]).default("normal"),
  deadline_date: z.string().optional(),
  deadline_id: z.string().max(200).optional(),
  documents: z.array(documentSchema).min(1).max(20),
});

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
        documentCount: body.documents.length,
        priority: body.priority,
      },
    }),
  },
  async (ctx, body) => {
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
    for (let i = 0; i < body.documents.length; i++) {
      const doc = body.documents[i];
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
      senderName: body.sender_name,
      senderRole: "lawyer",
      senderId: body.sender_id,
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
        documentCount: body.documents.length,
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
