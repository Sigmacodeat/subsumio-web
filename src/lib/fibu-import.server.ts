import { ENGINE_URL } from "@/lib/engine";
import { listOpenItems, markInvoicePaidFromOpenItem } from "@/lib/open-items";
import { applyMatch, autoMatchTransaction, type BankTransaction, type OpenItem } from "@/lib/fibu";
import { withKeyedLock } from "@/lib/keyed-lock";
import { AppError } from "@/lib/errors";

import { logger } from "@/lib/logger";
const log = logger("fibu-import");

export interface ImportResult {
  /** Newly recorded bookings. */
  imported: number;
  matched: number;
  /** Bookings recorded before (same id) — skipped, nothing paid twice. */
  duplicates: number;
  errors: number;
  /** Invoices set to "paid" because their open item is now settled. */
  invoicesPaid: number;
  results: Array<{ transaction: BankTransaction; duplicate: boolean; matched: boolean }>;
}

const TIMEOUT = 10_000;

async function engineWrite(headers: Record<string, string>, body: unknown): Promise<Response> {
  return fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
}

export function bankTransactionSlug(id: string): string {
  return `legal/bank-transactions/${id}`;
}

/**
 * Was this booking imported before? 404 → no. Any other failure throws: an
 * unknown answer must not be read as "new", or the payment is booked twice.
 */
export async function bankTransactionExists(
  headers: Record<string, string>,
  id: string
): Promise<boolean> {
  const slug = bankTransactionSlug(id).split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${ENGINE_URL}/api/pages/${slug}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return false;
  if (!res.ok) {
    throw new AppError("Bankbuchungen konnten nicht geprüft werden. Bitte erneut versuchen.", {
      code: "engine_error",
      statusCode: 502,
      details: { engine_status: res.status },
    });
  }
  const page = (await res.json().catch(() => null)) as {
    frontmatter?: { status?: unknown };
  } | null;
  return page?.frontmatter?.status !== "tombstoned";
}

/** Open items whose balance or status a match changed. */
export function changedOpenItems(before: OpenItem[], after: OpenItem[]): OpenItem[] {
  return after.filter((item) => {
    const original = before.find((o) => o.id === item.id);
    return (
      !!original &&
      (item.status !== original.status ||
        item.paid_amount !== original.paid_amount ||
        item.open_amount !== original.open_amount ||
        item.dunning_fee !== original.dunning_fee)
    );
  });
}

/**
 * Gemeinsamer Pfad für manuelle Erfassung, Bank-Feed und camt.053-Import.
 *
 * Jede Buchung hat eine deterministische ID (bankTransactionId). Sie wird
 * zuerst create-only angelegt (`if_absent`): existiert sie schon, ist es
 * eine Dublette — sie wird übersprungen und NICHT erneut auf einen offenen
 * Posten angerechnet. Erst eine neu angelegte Buchung wird gematcht; der OP
 * wird per Merge nur in den Zahlungsfeldern geändert. Ist er danach
 * ausgeglichen, wird die Rechnung auf „bezahlt“ gestellt.
 *
 * Ein Import pro Kanzlei zur Zeit (Sperre), damit parallele Importe nicht
 * mit veralteten OP-Salden rechnen.
 */
export async function importAndMatchTransactions(
  headers: Record<string, string>,
  transactions: BankTransaction[],
  opts: { brainId?: string } = {}
): Promise<ImportResult> {
  const lockKey = `bank-import:${opts.brainId ?? headers["x-subsumio-brain"] ?? "default"}`;
  return withKeyedLock(lockKey, () => importLocked(headers, transactions));
}

async function importLocked(
  headers: Record<string, string>,
  transactions: BankTransaction[]
): Promise<ImportResult> {
  // Paginiert laden — die Engine kappt Einzelrequests auf 100 Einträge.
  let openItems: OpenItem[] = await listOpenItems(headers).catch(() => {
    throw new Error("engine_error");
  });

  const result: ImportResult = {
    imported: 0,
    matched: 0,
    duplicates: 0,
    errors: 0,
    invoicesPaid: 0,
    results: [],
  };
  const seen = new Set<string>();

  for (const transaction of transactions) {
    const slug = `legal/bank-transactions/${transaction.id}`;
    if (seen.has(transaction.id)) {
      result.duplicates++;
      result.results.push({ transaction, duplicate: true, matched: false });
      continue;
    }
    seen.add(transaction.id);

    // Claim the booking first: create-only. An existing one is a duplicate.
    let claim: Response;
    try {
      claim = await engineWrite(headers, {
        slug,
        title: `Bankbuchung ${transaction.date}`,
        type: "bank_transaction",
        frontmatter: transaction,
        if_absent: true,
      });
    } catch {
      result.errors++;
      continue;
    }
    if (claim.status === 409) {
      result.duplicates++;
      result.results.push({ transaction, duplicate: true, matched: false });
      continue;
    }
    if (!claim.ok) {
      result.errors++;
      continue;
    }
    result.imported++;

    const match = autoMatchTransaction(transaction, openItems);
    if (!match) {
      result.results.push({ transaction, duplicate: false, matched: false });
      continue;
    }
    const applied = applyMatch(transaction, match, openItems);
    let opWritten = true;
    for (const item of applied.openItems) {
      const original = openItems.find((o) => o.id === item.id);
      if (
        !original ||
        (item.status === original.status &&
          item.paid_amount === original.paid_amount &&
          item.open_amount === original.open_amount)
      ) {
        continue;
      }
      try {
        const res = await engineWrite(headers, {
          slug: `legal/open-items/${item.id}`,
          frontmatter: {
            paid_amount: item.paid_amount,
            open_amount: item.open_amount,
            status: item.status,
            updated_at: item.updated_at,
          },
          merge: true,
        });
        if (!res.ok) {
          opWritten = false;
          result.errors++;
          continue;
        }
      } catch {
        opWritten = false;
        result.errors++;
        continue;
      }
      if (item.status === "paid" && original.status !== "paid") {
        try {
          if (await markInvoicePaidFromOpenItem(headers, item, transaction.date)) {
            result.invoicesPaid++;
          }
        } catch (err) {
          result.errors++;
          log.error("invoice paid sync failed", {
            invoice: item.invoice_id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    if (!opWritten) {
      // The booking stays recorded but unmatched — a later manual assignment
      // is possible; nothing was credited.
      result.results.push({ transaction, duplicate: false, matched: false });
      continue;
    }
    openItems = applied.openItems;
    result.matched++;
    result.results.push({ transaction: applied.transaction, duplicate: false, matched: true });
    try {
      const res = await engineWrite(headers, {
        slug,
        frontmatter: {
          matched_invoice_id: applied.transaction.matched_invoice_id,
          matched_case_slug: applied.transaction.matched_case_slug,
          match_confidence: applied.transaction.match_confidence,
          status: applied.transaction.status,
        },
        merge: true,
      });
      if (!res.ok) result.errors++;
    } catch {
      result.errors++;
    }
  }
  return result;
}
