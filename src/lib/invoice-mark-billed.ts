/**
 * Marks the entries a freshly created invoice covers as billed on the matter.
 *
 * Runs AFTER the invoice page exists, so it never throws: it reports whether
 * any step failed and the caller shows a warning. An error would invite the
 * lawyer to retry, and a retry creates a second invoice for the same work.
 *
 * Online it never writes back the dialog's snapshot of `time_entries`: time
 * entries go through `/api/time/mark-billed` (server reads the current matter,
 * audit trail, SSE). Expenses have no dedicated route, so only the expense list
 * is patched by id on a freshly read copy of the matter — entries added or
 * edited since the dialog opened are kept.
 */
import { api } from "@/lib/api";
import { enqueueMutation, isOnline } from "@/lib/offline-store";

interface BillableRef {
  id: string;
}

export interface MarkInvoicedEntriesInput {
  caseSlug: string;
  invoiceNumber: string;
  timeEntryIds: string[];
  expenseIds: string[];
  /** The dialog's view of the matter lists with the billed flags set — offline queue only. */
  snapshot: { time_entries: BillableRef[]; expenses: BillableRef[] };
}

export interface MarkInvoicedEntriesDeps {
  isOnline: () => boolean;
  markBilled: typeof api.time.markBilled;
  getPage: (slug: string) => Promise<{ frontmatter?: Record<string, unknown> }>;
  updatePage: typeof api.brain.updatePage;
  enqueueMutation: typeof enqueueMutation;
}

const defaultDeps: MarkInvoicedEntriesDeps = {
  isOnline,
  markBilled: (input) => api.time.markBilled(input),
  getPage: (slug) => api.brain.getPage(slug),
  updatePage: (page) => api.brain.updatePage(page),
  enqueueMutation,
};

/** Returns true when at least one bookkeeping step failed (show a warning). */
export async function markInvoicedEntriesBilled(
  input: MarkInvoicedEntriesInput,
  deps: MarkInvoicedEntriesDeps = defaultDeps
): Promise<boolean> {
  const { caseSlug, invoiceNumber, timeEntryIds, expenseIds } = input;
  let failed = false;

  if (!deps.isOnline()) {
    // Offline the queue replays a merge later; only the lists this invoice touched.
    const frontmatter: Record<string, unknown> = {};
    if (timeEntryIds.length > 0) frontmatter.time_entries = input.snapshot.time_entries;
    if (expenseIds.length > 0) frontmatter.expenses = input.snapshot.expenses;
    if (Object.keys(frontmatter).length === 0) return false;
    try {
      await deps.enqueueMutation({ type: "updatePage", payload: { slug: caseSlug, frontmatter } });
    } catch {
      failed = true;
    }
    return failed;
  }

  if (timeEntryIds.length > 0) {
    try {
      await deps.markBilled({
        entry_ids: timeEntryIds,
        invoice_number: invoiceNumber,
        case_slug: caseSlug,
      });
    } catch {
      failed = true;
    }
  }

  if (expenseIds.length > 0) {
    try {
      const fresh = await deps.getPage(caseSlug);
      const current = fresh.frontmatter?.expenses;
      const ids = new Set(expenseIds);
      const expenses = (Array.isArray(current) ? current : []).map((entry) =>
        entry && typeof entry === "object" && ids.has(String((entry as BillableRef).id))
          ? { ...(entry as object), billed: true, invoice_number: invoiceNumber }
          : entry
      );
      await deps.updatePage({ slug: caseSlug, frontmatter: { expenses } });
    } catch {
      failed = true;
    }
  }

  return failed;
}
