import { z } from "zod";
import { can } from "@/lib/permissions";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { createHandler, apiError } from "@/lib/api-handler";
import {
  GUARD_READ_FAILED,
  checkInvoiceWrite,
  isInvoicePage,
  readCurrentPage,
  rejectionResponse,
} from "@/lib/page-write-guards";
import { closeOpenItemForInvoice, createOpenItemForInvoice } from "@/lib/open-items";
import { releaseWorkOfInvoice } from "@/lib/invoice-billing-lock";
import { invoiceIssueProblem, isIssuingTransition } from "@/lib/invoice-issue";

import { logger } from "@/lib/logger";
import { emitInvoicePaid } from "@/lib/webhook-dispatch";
const log = logger("api/invoices/[slug]");

function validSlug(raw: string): string | null {
  const decoded = decodeURIComponent(raw);
  if (!decoded || decoded.includes("..") || decoded.includes("//")) return null;
  return decoded;
}

const patchSchema = z.object({}).passthrough();

export const GET = createHandler(
  {
    action: "invoice.read",
    rateTier: "standard",
  },
  async (ctx, _body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = validSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    try {
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404) return apiError("not_found", "Rechnung nicht gefunden", 404);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = await res.json();
      if (page?.type && page.type !== "invoice") {
        return apiError("not_an_invoice", "Seite ist keine Rechnung", 400);
      }
      return Response.json(page);
    } catch (err) {
      log.error("[invoices/slug] get failed:", err instanceof Error ? err.message : String(err));
      return apiError("not_found", "Rechnung nicht gefunden", 404);
    }
  }
);

export const PATCH = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    body: patchSchema,
    audit: (_ctx, body) => ({
      action: "invoice.update" as const,
      entityType: "invoice",
      details: { fields: Object.keys(body) },
    }),
  },
  async (ctx, body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = validSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    if (Object.keys(body).length === 0) {
      return apiError("nothing_to_update", "Keine Felder zum Aktualisieren", 400);
    }

    // An issued invoice (sent/paid/overdue/cancelled) is a finalized document
    // (§ 132 BAO / UStG). The shared guard lets only payment and delivery
    // bookkeeping through (mark paid/overdue, e-invoice status) and refuses
    // every content change — corrections go through the Storno-Note route.
    // Fail closed: when the current invoice cannot be read, nothing is written.
    const currentRead = await readCurrentPage(ENGINE_URL, ctx.headers, slug);
    if (currentRead.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
    if (currentRead.kind === "missing")
      return apiError("not_found", "Rechnung nicht gefunden", 404);
    if (currentRead.page.type && !isInvoicePage(currentRead.page)) {
      return apiError("not_an_invoice", "Seite ist keine Rechnung", 400);
    }
    const rejection = checkInvoiceWrite(currentRead.page, {
      mode: "merge",
      frontmatter: body as Record<string, unknown>,
    });
    if (rejection) return rejectionResponse(rejection);

    // Issuing (draft → sent/paid/overdue) freezes the invoice: it must be
    // complete and its sums must add up before that happens.
    const prevStatus = String(currentRead.page.frontmatter?.status ?? "draft");
    const nextStatus = (body as Record<string, unknown>).status;
    const issuing = isIssuingTransition(prevStatus, nextStatus);
    // A draft is deleted (its billed work is released), never "cancelled" —
    // a cancelled draft would be frozen with its work still reserved.
    if (issuing && nextStatus === "cancelled") {
      return apiError(
        "draft_cancel_use_delete",
        "Ein Entwurf wird gelöscht, nicht storniert — die abgerechneten Leistungen werden dabei wieder freigegeben.",
        409
      );
    }
    // Stellen (Entwurf → gestellt) ist eine anwaltliche Entscheidung; das
    // Sekretariat bereitet den Entwurf vor und bucht Zahlungen.
    if (issuing && !can(ctx.user, "invoice.issue")) {
      return apiError(
        "invoice_issue_forbidden",
        "Rechnungen stellen nur Anwältinnen/Anwälte oder Administratoren. Der Entwurf bleibt gespeichert.",
        403
      );
    }
    if (issuing) {
      const problem = invoiceIssueProblem({
        ...((currentRead.page.frontmatter ?? {}) as Record<string, unknown>),
        ...(body as Record<string, unknown>),
      });
      if (problem) return rejectionResponse(problem);
    }

    try {
      const frontmatter = body as Record<string, unknown>;
      const res = await enginePatchPage(ctx.headers, { slug, frontmatter }, { timeoutMs: 15_000 });
      if (res.status === 404) return apiError("not_found", "Rechnung nicht gefunden", 404);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return Response.json(payload.error ? payload : { error: `Engine returned ${res.status}` }, {
          status: res.status,
        });
      }
      void logAudit("invoice.update", "invoice", {
        brainId: ctx.brainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        entityId: slug,
        details: { fields: Object.keys(body) },
      });

      // OPOS-Lebenszyklus an Statusübergänge koppeln: "sent" legt den offenen
      // Posten an (idempotent), "paid" schließt ihn. Best-effort — der Patch
      // ist schon geschrieben; ein OP-Fehler wird geloggt, nicht verschluckt.
      try {
        if (issuing && nextStatus !== "cancelled") {
          await createOpenItemForInvoice(
            ctx.headers,
            slug,
            (currentRead.page.frontmatter ?? {}) as Record<string, unknown>
          );
        }
        if (nextStatus === "paid" && prevStatus !== "paid") {
          emitInvoicePaid(
            ctx.brainId,
            { slug, frontmatter: (currentRead.page.frontmatter ?? {}) as Record<string, unknown> },
            {
              paid_at: typeof frontmatter.paid_at === "string" ? frontmatter.paid_at : undefined,
              paid_amount: frontmatter.paid_amount,
              payment_method:
                typeof frontmatter.payment_method === "string"
                  ? frontmatter.payment_method
                  : undefined,
            }
          );
          await closeOpenItemForInvoice(ctx.headers, slug, "paid");
        }
      } catch (err) {
        log.error(
          "[invoices/slug] opos sync failed:",
          err instanceof Error ? err.message : String(err)
        );
      }
      return Response.json(await res.json());
    } catch (err) {
      log.error("[invoices/slug] patch failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unreachable", "Engine nicht erreichbar", 503);
    }
  }
);

export const DELETE = createHandler(
  {
    action: "invoice.cancel",
    rateTier: "standard",
    audit: (_ctx, _body) => ({
      action: "invoice.delete" as const,
      entityType: "invoice",
      details: { reason: "manual_delete" },
    }),
  },
  async (ctx, _body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = validSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    // Only drafts may be deleted. Fail closed on read errors.
    const currentRead = await readCurrentPage(ENGINE_URL, ctx.headers, slug);
    if (currentRead.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
    if (currentRead.kind === "missing")
      return apiError("not_found", "Rechnung nicht gefunden", 404);
    if (currentRead.page.type && !isInvoicePage(currentRead.page)) {
      return apiError("not_an_invoice", "Seite ist keine Rechnung", 400);
    }
    if (checkInvoiceWrite(currentRead.page, { mode: "delete" })) {
      return apiError("cannot_delete_non_draft", "Nur Entwürfe können gelöscht werden", 409);
    }

    try {
      // No engine DELETE route — soft-delete the draft by tombstoning via
      // merge-update so it drops out of active invoice listings.
      const res = await enginePatchPage(
        ctx.headers,
        {
          slug,
          frontmatter: {
            status: "tombstoned",
            tombstoned_at: new Date().toISOString(),
            tombstoned_by: ctx.user.email,
            tombstone_reason: "manual_delete",
          },
        },
        { timeoutMs: 10_000 }
      );
      if (res.status === 404) return apiError("not_found", "Rechnung nicht gefunden", 404);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      void logAudit("invoice.delete", "invoice", {
        brainId: ctx.brainId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        entityId: slug,
      });

      // The deleted draft no longer bills its work — put it back to open so
      // a corrected invoice can take it.
      const released = await releaseWorkOfInvoice(
        ctx.headers,
        slug,
        (currentRead.page.frontmatter ?? {}) as Record<string, unknown>,
        "draft_deleted"
      );
      return Response.json({ ok: true, released });
    } catch (err) {
      log.error("[invoices/slug] delete failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unreachable", "Engine nicht erreichbar", 503);
    }
  }
);
