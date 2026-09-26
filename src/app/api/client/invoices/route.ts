import { z } from "zod";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { listEnginePages } from "@/lib/engine-pages";
import { readClientMatter } from "@/lib/client-view";
import { isPortalVisibleInvoice } from "@/lib/portal-view";

export const dynamic = "force-dynamic";

const querySchema = z.object({ case: z.string().min(1).max(300) });

/** Upper bound for the firm-wide invoice scan (same as the portal). */
const INVOICE_SCAN_MAX = 50_000;

/** Issued invoices of one of the client's matters — never drafts or cancelled ones. */
export const GET = createHandler(
  { action: "client.read", rateTier: "standard", query: querySchema },
  async (ctx, _body, query) => {
    const viewer = { brainId: ctx.brainId, user: ctx.user };
    let found;
    try {
      found = await readClientMatter(viewer, query!.case);
    } catch {
      return apiError("engine_error", "Akte konnte nicht geladen werden", 502);
    }
    if (!found) return apiError("not_found", "Akte nicht gefunden", 404);
    const pages = await listEnginePages(found.headers, "invoice", INVOICE_SCAN_MAX, {
      strict: true,
    }).catch(() => null);
    if (!pages) return apiError("engine_error", "Rechnungen konnten nicht geladen werden", 502);
    const invoices = pages
      .filter((p) =>
        isPortalVisibleInvoice(
          p.frontmatter as { case_slugs?: unknown; status?: unknown },
          found.page.slug
        )
      )
      .map((p) => {
        const fm = (p.frontmatter ?? {}) as Record<string, unknown>;
        return {
          slug: p.slug,
          invoice_number: typeof fm.invoice_number === "string" ? fm.invoice_number : "",
          status: String(fm.status),
          date: typeof fm.date === "string" ? fm.date : undefined,
          due_date: typeof fm.due_date === "string" ? fm.due_date : undefined,
          total: typeof fm.total === "number" ? fm.total : 0,
        };
      })
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return apiSuccess({ invoices });
  }
);
