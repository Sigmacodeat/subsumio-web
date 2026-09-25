import { ENGINE_URL } from "@/lib/engine";
import { AppError } from "@/lib/errors";
import { listOpenItems } from "@/lib/open-items";
import {
  applyMatch,
  autoMatchTransaction,
  withBatchOccurrenceIds,
  type BankTransaction,
  type OpenItem,
} from "@/lib/fibu";

export interface ImportResult {
  imported: number;
  matched: number;
  /** Already imported earlier (same booking) — not matched or booked again. */
  skipped: number;
  errors: number;
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
 * Gemeinsamer Pfad für Bank-Feed und camt.053-Dateiimport: OPOS laden,
 * jede Transaktion auto-matchen, geänderte OPOS und Transaktion in der
 * Engine persistieren. `headers` sind die authentifizierten ctx-Headers.
 *
 * Bereits importierte Buchungen (gleiche Transaktions-ID) werden übersprungen.
 * Scheitert das Speichern eines offenen Postens, wird die Buchung NICHT
 * gespeichert — ein erneuter Import holt sie dann nach, statt sie als
 * erledigt zu überspringen.
 */
export async function importAndMatchTransactions(
  headers: Record<string, string>,
  transactions: BankTransaction[]
): Promise<ImportResult> {
  // Paginiert laden — die Engine kappt Einzelrequests auf 100 Einträge.
  let openItems: OpenItem[] = await listOpenItems(headers).catch(() => {
    throw new Error("engine_error");
  });

  let imported = 0;
  let matched = 0;
  let skipped = 0;
  let errors = 0;
  for (const transaction of withBatchOccurrenceIds(transactions)) {
    if (await bankTransactionExists(headers, transaction.id)) {
      skipped++;
      continue;
    }
    const match = autoMatchTransaction(transaction, openItems);
    const result = match ? applyMatch(transaction, match, openItems) : { transaction, openItems };
    let itemsSaved = true;
    if (match) {
      for (const item of changedOpenItems(openItems, result.openItems)) {
        const res = await fetch(`${ENGINE_URL}/api/pages`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: `legal/open-items/${item.id}`,
            title: `OPOS: ${item.invoice_number} — ${item.client_name}`,
            type: "open_item",
            frontmatter: item,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) itemsSaved = false;
      }
    }
    if (!itemsSaved) {
      errors++;
      continue;
    }
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: bankTransactionSlug(transaction.id),
        title: `Bankbuchung ${transaction.date}`,
        type: "bank_transaction",
        frontmatter: result.transaction,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      errors++;
      continue;
    }
    imported++;
    if (match) {
      matched++;
      openItems = result.openItems;
    }
  }
  return { imported, matched, skipped, errors };
}
