import { z } from "zod";
import { createServerBrainClient } from "@/lib/server-brain";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { buildBeaImportBundle, parseBeaXmlBatch } from "@/lib/bea-import";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { ENGINE_URL } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * P2-6: Fuzzy-match a beA message to an existing case.
 * Strategy:
 * 1. Exact case_ref match against case_number
 * 2. Partial case_ref match (prefix or suffix)
 * 3. Sender/recipient name match against client_name or opponent_name
 * Returns { case_slug, case_number, confidence } or null.
 */
async function autoAssignCase(
  headers: Record<string, string>,
  message: { case_ref?: string; sender?: string; recipient?: string }
): Promise<{
  case_slug: string;
  case_number: string;
  confidence: "high" | "medium" | "low";
} | null> {
  try {
    const res = await fetch(`${ENGINE_URL}/api/pages?type=legal_case&limit=500`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const cases = await res.json();
    if (!Array.isArray(cases) || cases.length === 0) return null;

    const caseRef = (message.case_ref || "").trim().toLowerCase();
    const senderName = (message.sender || "").trim().toLowerCase();
    const recipientName = (message.recipient || "").trim().toLowerCase();

    // Strategy 1: Exact case_ref match
    if (caseRef) {
      for (const c of cases) {
        const fm = c.frontmatter ?? {};
        const cn = String(fm.case_number || "").toLowerCase();
        if (cn && cn === caseRef) {
          return { case_slug: c.slug, case_number: String(fm.case_number), confidence: "high" };
        }
      }
    }

    // Strategy 2: Partial case_ref match (prefix/suffix)
    if (caseRef && caseRef.length >= 4) {
      for (const c of cases) {
        const fm = c.frontmatter ?? {};
        const cn = String(fm.case_number || "").toLowerCase();
        if (cn && (cn.startsWith(caseRef) || caseRef.startsWith(cn) || cn.includes(caseRef))) {
          return { case_slug: c.slug, case_number: String(fm.case_number), confidence: "medium" };
        }
      }
    }

    // Strategy 3: Sender/recipient name match against client_name or opponent_name
    const namesToMatch = [senderName, recipientName].filter((n) => n.length > 2);
    if (namesToMatch.length > 0) {
      for (const c of cases) {
        const fm = c.frontmatter ?? {};
        const clientName = String(fm.client_name || "").toLowerCase();
        const opponentName = String(fm.opponent_name || "").toLowerCase();
        for (const name of namesToMatch) {
          if (
            (clientName && clientName.includes(name)) ||
            (opponentName && opponentName.includes(name))
          ) {
            return {
              case_slug: c.slug,
              case_number: String(fm.case_number || c.slug),
              confidence: "low",
            };
          }
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

const beaFileSchema = z.object({
  filename: z.string().min(1).max(240),
  content: z.string().min(1, "content_required").max(10_000_000, "content_too_large"),
});

const beaImportSchema = z.object({
  filename: z.string().max(240).optional(),
  files: z.array(beaFileSchema).min(1, "files_required").max(50),
  source: z.enum(["upload", "watch_dir", "manual"]).default("upload"),
  dry_run: z.boolean().default(false),
});

export const POST = createHandler(
  {
    action: "brain.write",
    rateTier: "heavy",
    quota: "uploads",
    body: beaImportSchema,
    audit: (ctx, body) => ({
      action: "connector.sync" as const,
      entityType: "bea_import",
      entityId: body.filename || "bea-import",
      details: {
        brainId: ctx.brainId,
        files: body.files.length,
        source: body.source,
        dry_run: body.dry_run,
      },
    }),
  },
  async (ctx, body) => {
    const parsed = parseBeaXmlBatch(body.files);
    const bundle = buildBeaImportBundle(parsed, {
      filename: body.filename || body.files[0]?.filename,
      source: body.source,
      importedBy: ctx.user.email,
    });

    if (parsed.valid_count === 0) {
      return apiError("bea_no_valid_messages", "Keine gueltigen beA-Nachrichten gefunden", 422, {
        errors: parsed.errors,
      });
    }

    if (body.dry_run) {
      return apiSuccess({
        dry_run: true,
        result: parsed,
        import_page: bundle.importPage,
        message_pages: bundle.messagePages,
      });
    }

    try {
      const brain = createServerBrainClient(ctx.headers);
      await brain.createPage(bundle.importPage);

      // P2-6: Auto-assign each beA message to a case via fuzzy matching
      const assignments: Array<{
        message_slug: string;
        case_slug: string;
        case_number: string;
        confidence: string;
      }> = [];
      for (const page of bundle.messagePages) {
        const fm = page.frontmatter as Record<string, unknown>;
        const match = await autoAssignCase(ctx.headers, {
          case_ref: String(fm.case_ref || ""),
          sender: String(fm.sender || ""),
          recipient: String(fm.recipient || ""),
        });
        if (match) {
          // Stamp the case assignment onto the message page frontmatter
          page.frontmatter = {
            ...page.frontmatter,
            assigned_case_slug: match.case_slug,
            assigned_case_number: match.case_number,
            assignment_confidence: match.confidence,
            assignment_status: match.confidence === "high" ? "auto" : "suggested",
          };
          assignments.push({
            message_slug: page.slug,
            case_slug: match.case_slug,
            case_number: match.case_number,
            confidence: match.confidence,
          });
        }
        await brain.createPage(page);
      }

      broadcastSseEvent(ctx.brainId, "bea.import.created", {
        slug: bundle.importPage.slug,
        valid_count: parsed.valid_count,
        error_count: parsed.error_count,
        by: ctx.user.email,
        auto_assigned: assignments.length,
      });

      return apiSuccess(
        {
          success: true,
          result: parsed,
          import_slug: bundle.importPage.slug,
          message_slugs: bundle.messagePages.map((page) => page.slug),
          auto_assignments: assignments.length > 0 ? assignments : undefined,
        },
        undefined,
        parsed.error_count > 0 ? 207 : 201
      );
    } catch (err) {
      console.error("[bea-import] failed:", err instanceof Error ? err.message : String(err));
      return apiError("bea_import_failed", "beA-Import konnte nicht gespeichert werden", 500);
    }
  }
);
