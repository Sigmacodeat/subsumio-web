import { z } from "zod";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { logAudit } from "@/lib/audit";
import { createHandler, apiError } from "@/lib/api-handler";

import { logger } from "@/lib/logger";
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

    // A sent/paid invoice is a finalized document (GoBD/Rechnungsstellung —
    // BAO/UStG). No caller in this codebase ever set _allow_status_override
    // (grep confirms: /api/invoices/send and /remind write status themselves
    // via enginePatchPage, bypassing this route entirely), so it was a pure
    // client-controllable bypass of the guard below — removed. The guard
    // itself used to check only `body.status`, which blocked *setting*
    // status to sent/paid via PATCH but did nothing to stop a client from
    // PATCHing other fields (amount, line items, dates) on an invoice that
    // was ALREADY sent or paid. Fetch the current status first and reject
    // any PATCH once the invoice has left draft/pending, full stop — there
    // is no dedicated storno/Korrekturbeleg endpoint yet (see audit Welle B:
    // unveränderbare Rechnung + Stornonote), so the only safe behavior today
    // is to refuse the edit rather than silently allow it.
    const PROTECTED_STATUS = new Set(["sent", "paid", "overdue"]);
    try {
      const currentRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (currentRes.ok) {
        const currentPage = await currentRes.json();
        const currentStatus = String(currentPage?.frontmatter?.status ?? "");
        if (PROTECTED_STATUS.has(currentStatus)) {
          return apiError(
            "invoice_finalized",
            `Rechnung ist bereits ${currentStatus === "paid" ? "bezahlt" : "versendet"} und kann nicht mehr geändert werden. Für Korrekturen: Stornonote verwenden.`,
            409
          );
        }
      }
    } catch {
      // If the read fails, fall through to the engine PATCH below — the
      // engine's own state is the source of truth and this is a best-effort
      // pre-check, not the only enforcement point (the DELETE handler above
      // has the same fetch-then-check shape and the same fallback).
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
        entityId: slug,
        details: { fields: Object.keys(body) },
      });
      return Response.json(await res.json());
    } catch (err) {
      log.error("[invoices/slug] patch failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unreachable", "Engine nicht erreichbar", 503);
    }
  }
);

export const DELETE = createHandler(
  {
    action: "invoice.write",
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

    try {
      const checkRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
        headers: ctx.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (checkRes.status === 404) return apiError("not_found", "Rechnung nicht gefunden", 404);
      if (checkRes.ok) {
        const page = await checkRes.json();
        const fm = page?.frontmatter ?? {};
        const protectedStatuses = new Set(["sent", "paid", "overdue"]);
        if (protectedStatuses.has(String(fm.status ?? ""))) {
          return apiError("cannot_delete_non_draft", "Nur Entwürfe können gelöscht werden", 409);
        }
      }
    } catch {
      // If check fails, let the DELETE through — engine will enforce.
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
      void logAudit("invoice.delete", "invoice", { entityId: slug });
      return Response.json({ ok: true });
    } catch (err) {
      log.error("[invoices/slug] delete failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unreachable", "Engine nicht erreichbar", 503);
    }
  }
);
