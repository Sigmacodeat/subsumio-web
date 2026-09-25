/**
 * Storno-Note für eine bereits versendete/bezahlte Rechnung.
 *
 * Rechnungen mit Status sent/paid/overdue sind seit Welle A unveränderbar
 * (route.ts PATCH blockt jede Änderung). Das ist richtig für GoBD/§ 132
 * BAO, hinterließ aber keinen Weg, einen echten Fehler zu korrigieren —
 * Anwaltsalltag hat Tippfehler und falsche Beträge wie jede andere Praxis.
 * Diese Route legt eine ZWEITE, eigenständige Rechnung mit invoice_type
 * "storno" an, die per parent_invoice_id auf das Original zeigt und dessen
 * Beträge negiert — die Originalrechnung selbst wird nicht angerührt
 * (genau der GoBD-korrekte Weg: stornieren heißt einen neuen Beleg
 * ausstellen, nicht den alten verändern).
 */

import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { createHandler, apiError, apiSuccess } from "@/lib/api-handler";
import { sha256Hex, gobdFrontmatter, invoiceContentString } from "@/lib/gobd";
import { allocateInvoiceNumber, highestInvoiceNumber } from "@/lib/invoice-numbering";
import { closeOpenItemForInvoice } from "@/lib/open-items";
import { logAudit } from "@/lib/audit";
import { releaseWorkOfInvoice } from "@/lib/invoice-billing-lock";

import { logger } from "@/lib/logger";
const log = logger("api/invoices/[slug]/storno");

function validSlug(raw: string): string | null {
  const decoded = decodeURIComponent(raw);
  if (!decoded || decoded.includes("..") || decoded.includes("//")) return null;
  return decoded;
}

interface InvoiceItem {
  date: string;
  description: string;
  hours: number;
  rate: number;
  amount: number;
}
interface ExpenseItem {
  date: string;
  description: string;
  amount: number;
}

export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    audit: (_ctx, _body, _query, req) => {
      const slug = (req as unknown as { __slug?: string })?.__slug;
      return {
        action: "invoice.update" as const,
        entityType: "invoice",
        entityId: slug,
        details: { action: "storno" },
      };
    },
  },
  async (ctx, _body, _query, req) => {
    const { slug: rawSlug } = await (req as unknown as { params: Promise<{ slug: string }> })
      .params;
    const slug = validSlug(rawSlug);
    if (!slug) return apiError("invalid_slug", "Ungültiger Slug", 400);

    const getRes = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(slug)}`, {
      headers: ctx.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (getRes.status === 404) return apiError("not_found", "Rechnung nicht gefunden", 404);
    if (!getRes.ok) return apiError("engine_unreachable", "Rechnung nicht lesbar", 503);
    const original = await getRes.json();
    const fm = (original.frontmatter ?? {}) as Record<string, unknown>;

    const PROTECTED_STATUS = new Set(["sent", "paid", "overdue"]);
    const status = String(fm.status ?? "");
    if (!PROTECTED_STATUS.has(status)) {
      return apiError(
        "not_stornoable",
        "Nur versendete, bezahlte oder überfällige Rechnungen können storniert werden — ein Entwurf lässt sich stattdessen direkt bearbeiten oder löschen.",
        409
      );
    }
    if (fm.invoice_type === "storno") {
      return apiError(
        "already_storno",
        "Eine Storno-Note kann nicht selbst storniert werden.",
        409
      );
    }

    // Refuse a second storno of the same invoice — check every invoice page
    // for one that already points back here as parent_invoice_id. Strict:
    // a partial list could miss an existing storno and allow a duplicate.
    const allInvoices = await listEnginePages(ctx.headers, "invoice", 5000, { strict: true });
    const existingStorno = allInvoices.find(
      (p) => p.frontmatter?.parent_invoice_id === slug && p.frontmatter?.invoice_type === "storno"
    );
    if (existingStorno) {
      return apiError(
        "already_stornoed",
        `Diese Rechnung wurde bereits mit ${String(existingStorno.frontmatter?.invoice_number ?? existingStorno.slug)} storniert.`,
        409
      );
    }

    const year = new Date().getFullYear();
    const existingNumbers = allInvoices.map((p) => String(p.frontmatter?.invoice_number ?? ""));
    const number = await allocateInvoiceNumber(
      ctx.brainId,
      year,
      highestInvoiceNumber(existingNumbers, year)
    );

    const originalItems = Array.isArray(fm.items) ? (fm.items as InvoiceItem[]) : [];
    const originalExpenses = Array.isArray(fm.expenses) ? (fm.expenses as ExpenseItem[]) : [];
    const negatedItems = originalItems.map((i) => ({ ...i, amount: -i.amount }));
    const negatedExpenses = originalExpenses.map((e) => ({ ...e, amount: -e.amount }));

    const subtotal = -Number(fm.subtotal ?? 0);
    const expenseTotal = -Number(fm.expense_total ?? 0);
    const advancePayment = -Number(fm.advance_payment ?? 0);
    const tax = -Number(fm.tax ?? 0);
    const total = -Number(fm.total ?? 0);
    const date = new Date().toISOString().slice(0, 10);
    const stornoSlug = `legal/invoices/storno-${number.replace(/[^a-zA-Z0-9-]/g, "-")}`;

    const hashInput = {
      number,
      client: String(fm.client ?? ""),
      caseNumber: fm.case_number as string | undefined,
      date,
      subtotal,
      expenseTotal,
      advancePayment,
      tax,
      total,
      items: negatedItems,
      expenses: negatedExpenses,
    };
    const issuedAt = new Date();
    const hash = await sha256Hex(invoiceContentString(hashInput));

    const stornoPayload = {
      slug: stornoSlug,
      title: `Storno-Note ${number} zu ${String(fm.invoice_number ?? slug)}`,
      type: "invoice" as const,
      frontmatter: {
        type: "invoice",
        invoice_number: number,
        client: fm.client,
        client_slug: fm.client_slug,
        client_address: fm.client_address,
        case_number: fm.case_number,
        case_slugs: fm.case_slugs,
        date,
        due_date: date,
        items: negatedItems,
        expenses: negatedExpenses,
        status: "draft",
        subtotal,
        expense_total: expenseTotal,
        advance_payment: advancePayment,
        vat_rate: fm.vat_rate,
        tax,
        total,
        notes: `Storno-Note zu Rechnung ${String(fm.invoice_number ?? slug)} vom ${String(fm.date ?? "")}.`,
        invoice_type: "storno",
        parent_invoice_id: slug,
        ...gobdFrontmatter(hash, issuedAt),
      },
    };

    // Create-only: an invoice already stored at this slug is never replaced.
    const createRes = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...ctx.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ...stornoPayload, if_absent: true }),
      signal: AbortSignal.timeout(15_000),
    });
    if (createRes.status === 409) {
      return apiError(
        "invoice_exists",
        "Unter dieser Adresse gibt es bereits eine Rechnung. Es wurde nichts überschrieben.",
        409
      );
    }
    if (!createRes.ok) {
      log.error("[storno] create failed", { status: createRes.status });
      return apiError("engine_unreachable", "Storno-Note konnte nicht angelegt werden", 503);
    }

    void logAudit("invoice.update", "invoice", {
      entityId: stornoSlug,
      details: { action: "storno_created", forInvoice: slug, invoiceNumber: number },
    });

    // OPOS: der offene Posten der stornierten Rechnung wird ausgebucht —
    // sonst mahnt der Mahnlauf eine Rechnung, die nicht mehr gilt.
    // Best-effort: Storno-Note ist bereits angelegt; Fehler wird geloggt.
    try {
      await closeOpenItemForInvoice(ctx.headers, slug, "written_off", `Storniert durch ${number}`);
    } catch (err) {
      log.error(
        "[storno] opos write-off failed:",
        err instanceof Error ? err.message : String(err)
      );
    }

    // The stornoed invoice no longer bills its work — put it back to open so
    // the corrected invoice can take it (audit entry written by the helper).
    const released = await releaseWorkOfInvoice(ctx.headers, slug, fm, "storno");

    return apiSuccess({ slug: stornoSlug, invoice_number: number, released }, undefined, 201);
  }
);
