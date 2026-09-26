/**
 * POST /api/invoices — create a draft invoice together with its work.
 *
 * The time entries and expenses the invoice lists are reserved for its number
 * BEFORE the invoice page is written, in the engine's atomic array update
 * with an in-statement "already billed" skip. If any of them is billed
 * elsewhere (a parallel invoice got there first) or no longer exists, the
 * reservation is rolled back and nothing is created — 409, never a second
 * invoice over the same work.
 *
 * The sums are the server's to check: subtotal, expense total, VAT and total
 * must follow from the positions (in cents, VAT per rate — see
 * src/lib/invoice-totals.ts). An invoice whose sums do not add up is refused
 * with 422; the per-rate VAT breakdown is stamped by the server.
 *
 * Time positions follow the firm's billing rules (src/lib/billing-rules.ts,
 * opt-in `billingRulesEnabled`): with the rules on, every billed time entry
 * has a position whose billed minutes are its recorded minutes rounded up to
 * the increment; with them off, billed minutes must equal the recorded ones.
 */
import { z } from "zod";
import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import { findInvoicesByNumber } from "@/lib/invoice-lookup";
import { createHandler, apiError, apiSuccess, recordQuota } from "@/lib/api-handler";
import { createServerBrainClient } from "@/lib/server-brain";
import { broadcastSseEvent } from "@/lib/realtime-bus";
import { GUARD_READ_FAILED, readCurrentPage, rejectionResponse } from "@/lib/page-write-guards";
import { createInvoiceReservingEntries } from "@/lib/invoice-billing-lock";
import {
  checkStoredInvoiceTotals,
  computeInvoiceTotals,
  totalsInputFromFrontmatter,
} from "@/lib/invoice-totals";
import {
  activeBillingRules,
  checkTimeItemBilling,
  checkTimeItemsAgainstEntries,
  feeAgreementRate,
  type ActiveBillingRules,
  type FeeAgreementLike,
  type TimeEntryLike,
} from "@/lib/billing-rules";
import { loadKanzleiSettingsForBrain } from "@/lib/kanzlei-settings-server";
import { STANDALONE_ENTRY_PREFIX } from "@/lib/time-tracking";

import { logger } from "@/lib/logger";
const log = logger("api/invoices");

export const dynamic = "force-dynamic";

/**
 * The stored records the time positions are checked against: the billed
 * entries (matter array + standalone `time-entries/…` pages), the matter's
 * practice area and — with the billing rules on — its fee-agreement rate.
 * Throws when anything cannot be read (the caller refuses the invoice).
 */
async function loadBilledTimeRecords(
  headers: Record<string, string>,
  caseSlug: string,
  timeEntryIds: string[],
  rules: ActiveBillingRules | null
): Promise<{
  entries: Map<string, TimeEntryLike>;
  legalArea: string | null;
  feeAgreementRate: number | null;
}> {
  const entries = new Map<string, TimeEntryLike>();
  if (timeEntryIds.length === 0) return { entries, legalArea: null, feeAgreementRate: null };
  const brain = createServerBrainClient(headers);
  const matter = await brain.getPage(caseSlug);
  const mfm = (matter?.frontmatter ?? {}) as Record<string, unknown>;
  const wanted = new Set(timeEntryIds);
  const toEntry = (id: string, e: Record<string, unknown>): TimeEntryLike => {
    const tariff =
      e.tariff && typeof e.tariff === "object" ? (e.tariff as Record<string, unknown>) : null;
    return {
      id,
      description: String(e.description ?? ""),
      date: typeof e.date === "string" ? e.date : undefined,
      minutes: Number(e.minutes ?? 0),
      rate: e.rate === null || e.rate === undefined || e.rate === "" ? null : Number(e.rate),
      // A Tarifleistung is checked against its stored tariff amount.
      ...(tariff && typeof tariff.amount === "number"
        ? { tariffAmount: tariff.amount, tariffLabel: String(tariff.label ?? "") }
        : {}),
    };
  };
  for (const raw of Array.isArray(mfm.time_entries) ? mfm.time_entries : []) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const id = String(e.id ?? "");
    if (wanted.has(id)) entries.set(id, toEntry(id, e));
  }
  const standalone = timeEntryIds.filter(
    (id) => id.startsWith(STANDALONE_ENTRY_PREFIX) && !entries.has(id)
  );
  await Promise.all(
    standalone.map(async (id) => {
      const read = await readCurrentPage(ENGINE_URL, headers, id);
      if (read.kind === "error") throw new Error("time entry unreadable");
      if (read.kind === "found") {
        const fm = (read.page.frontmatter ?? {}) as Record<string, unknown>;
        if (String(fm.case_slug ?? "") === caseSlug) entries.set(id, toEntry(id, fm));
      }
    })
  );
  let agreementRate: number | null = null;
  if (rules) {
    // Only this matter's agreements (engine-side filter), complete or refused.
    const pages = await listEnginePages(headers, "fee_agreement", 10_000, {
      strict: true,
      failOnTruncate: true,
      frontmatter: { case_slug: caseSlug },
    });
    agreementRate = feeAgreementRate(
      pages.map((p) => p.frontmatter as unknown as FeeAgreementLike),
      caseSlug
    );
  }
  return {
    entries,
    legalArea: typeof mfm.legal_area === "string" ? mfm.legal_area : null,
    feeAgreementRate: agreementRate,
  };
}

const idList = z.array(z.string().min(1).max(300)).max(2000);

const createSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(300)
    .regex(/^(invoice|legal\/invoices)\/[A-Za-z0-9._-]+$/, "invalid_invoice_slug"),
  title: z.string().min(1).max(300),
  content: z.string().max(200_000).optional(),
  frontmatter: z
    .object({
      invoice_number: z.string().trim().min(1).max(100),
      status: z.literal("draft"),
      case_slugs: z.array(z.string().min(1).max(300)).min(1),
      time_entry_ids: idList.optional(),
      expense_entry_ids: idList.optional(),
    })
    .passthrough(),
});

export const POST = createHandler(
  {
    action: "invoice.write",
    rateTier: "standard",
    quota: "pages",
    body: createSchema,
    audit: (_ctx, body) => ({
      action: "invoice.create" as const,
      entityType: "invoice",
      entityId: body.slug,
      details: {
        invoice_number: body.frontmatter.invoice_number,
        case_slug: body.frontmatter.case_slugs[0],
        time_entries: body.frontmatter.time_entry_ids?.length ?? 0,
        expenses: body.frontmatter.expense_entry_ids?.length ?? 0,
      },
    }),
  },
  async (ctx, body) => {
    const fm = body.frontmatter;
    const invoiceNumber = fm.invoice_number;

    // Rechenrichtigkeit (§ 11 UStG 1994): the stored sums must follow from
    // the positions. Refused, never silently corrected — the content hash
    // covers the sums the client showed the lawyer.
    const mismatched = checkStoredInvoiceTotals(fm);
    if (mismatched.length > 0) {
      return apiError(
        "invoice_totals_mismatch",
        `Die Rechnungssummen passen nicht zu den Positionen (${mismatched.join(", ")}). Es wurde keine Rechnung angelegt — bitte die Rechnung neu erstellen.`,
        422
      );
    }
    if (fm.reverse_charge === true && !String(fm.client_vat_id ?? "").trim()) {
      return apiError(
        "client_vat_id_required",
        "Bei Übergang der Steuerschuld (Reverse Charge) ist die UID-Nummer des Mandanten Pflicht.",
        422
      );
    }
    // Billing rules: the same functions the dialog built the positions with.
    // Unreadable settings → refused, never checked against a guess.
    let settings;
    try {
      settings = await loadKanzleiSettingsForBrain(ctx.brainId);
    } catch {
      return rejectionResponse(GUARD_READ_FAILED);
    }
    const rules = activeBillingRules(settings);
    const billingProblems = checkTimeItemBilling(fm, rules);
    if (billingProblems.length > 0) {
      return apiError(
        "invoice_billing_mismatch",
        `Die Zeitpositionen passen nicht zu den Abrechnungsregeln der Kanzlei (${billingProblems.join(", ")}). Es wurde keine Rechnung angelegt — bitte die Rechnung neu erstellen.`,
        422
      );
    }
    const taxBreakdown = computeInvoiceTotals(totalsInputFromFrontmatter(fm)).tax_breakdown;
    const caseSlug = fm.case_slugs[0];
    const timeEntryIds = [...new Set(fm.time_entry_ids ?? [])];
    const expenseIds = [...new Set(fm.expense_entry_ids ?? [])];

    // The time positions must follow from the STORED time entries (minutes,
    // rate and its source) — not only from themselves. Unreadable records →
    // refused, never checked against the client's copy.
    let recordProblems: string[];
    try {
      const records = await loadBilledTimeRecords(ctx.headers, caseSlug, timeEntryIds, rules);
      recordProblems = checkTimeItemsAgainstEntries(fm, records.entries, rules, {
        feeAgreementRate: records.feeAgreementRate,
        legalArea: records.legalArea,
        settings,
      });
    } catch {
      return rejectionResponse(GUARD_READ_FAILED);
    }
    if (recordProblems.length > 0) {
      return apiError(
        "invoice_billing_mismatch",
        `Die Zeitpositionen passen nicht zu den erfassten Zeiteinträgen (${recordProblems.join(", ")}). Es wurde keine Rechnung angelegt — bitte die Akte neu laden und die Rechnung neu erstellen.`,
        422
      );
    }

    // Fail closed: a create must never land on an existing page. This read
    // answers early; the create-only write below is what guarantees it.
    const existing = await readCurrentPage(ENGINE_URL, ctx.headers, body.slug);
    if (existing.kind === "error") return rejectionResponse(GUARD_READ_FAILED);
    if (existing.kind === "found") {
      return apiError("invoice_exists", "Unter dieser Adresse gibt es bereits eine Rechnung", 409);
    }

    // An invoice number belongs to exactly one invoice — and the rollback of a
    // failed reservation relies on that.
    // Targeted lookup over every invoice of the firm (engine-side filter);
    // a failed or truncated read refuses the create.
    let sameNumber;
    try {
      sameNumber = await findInvoicesByNumber(ctx.headers, invoiceNumber);
    } catch {
      return rejectionResponse(GUARD_READ_FAILED);
    }
    if (sameNumber.length > 0) {
      return apiError(
        "invoice_number_taken",
        `Die Rechnungsnummer ${invoiceNumber} ist bereits vergeben.`,
        409
      );
    }

    try {
      const brain = createServerBrainClient(ctx.headers);
      const outcome = await createInvoiceReservingEntries(ctx.headers, brain, {
        slug: body.slug,
        title: body.title,
        content: body.content,
        frontmatter: {
          ...fm,
          tax_breakdown: taxBreakdown,
          time_entry_ids: timeEntryIds,
          expense_entry_ids: expenseIds,
        },
        caseSlug,
        invoiceNumber,
        timeEntryIds,
        expenseIds,
      });

      if (outcome.kind === "conflict") {
        return Response.json(
          {
            error: "entries_already_billed",
            message:
              "Einige Leistungen sind inzwischen abgerechnet oder nicht mehr vorhanden. Es wurde keine Rechnung erstellt — bitte die Akte neu laden und erneut abrechnen.",
            already_billed: outcome.alreadyBilled,
            not_found: outcome.notFound,
          },
          { status: 409 }
        );
      }
      if (outcome.kind === "exists") {
        return apiError(
          "invoice_exists",
          "Unter dieser Adresse gibt es bereits eine Rechnung",
          409
        );
      }
      if (outcome.kind === "create_failed") {
        log.error("[invoices] engine create rejected:", outcome.status);
        return Response.json(
          outcome.body ?? {
            error: "engine_error",
            message: "Rechnung konnte nicht angelegt werden",
          },
          { status: outcome.status }
        );
      }

      void recordQuota(ctx, "pages");
      broadcastSseEvent(ctx.brainId, "time.entry.billed", {
        case_slug: caseSlug,
        invoice_number: invoiceNumber,
        updated_count: outcome.claimed.time.length,
      });
      if (outcome.claimed.expenses.length > 0) {
        broadcastSseEvent(ctx.brainId, "expense.billed", {
          case_slug: caseSlug,
          invoice_number: invoiceNumber,
          updated_count: outcome.claimed.expenses.length,
        });
      }
      return apiSuccess(
        { slug: body.slug, invoice_number: invoiceNumber, billed: outcome.claimed },
        undefined,
        201
      );
    } catch (err) {
      log.error("[invoices] create failed:", err instanceof Error ? err.message : String(err));
      return apiError("engine_unreachable", "Rechnung konnte nicht angelegt werden", 503);
    }
  }
);
