import { ENGINE_URL } from "@/lib/engine";
import { listOpenItems } from "@/lib/open-items";
import { applyMatch, autoMatchTransaction, type BankTransaction, type OpenItem } from "@/lib/fibu";

export interface ImportResult {
  imported: number;
  matched: number;
  errors: number;
}

/**
 * Gemeinsamer Pfad für Bank-Feed und camt.053-Dateiimport: OPOS laden,
 * jede Transaktion auto-matchen, geänderte OPOS und Transaktion in der
 * Engine persistieren. `headers` sind die authentifizierten ctx-Headers.
 */
export async function importAndMatchTransactions(
  headers: Record<string, string>,
  transactions: BankTransaction[]
): Promise<ImportResult> {
  // Paginiert laden — die Engine kappt Einzelrequests auf 100 Einträge.
  let openItems: OpenItem[] = await listOpenItems(headers).catch(() => {
    throw new Error("engine_error");
  });

  let matched = 0;
  let errors = 0;
  for (const transaction of transactions) {
    const match = autoMatchTransaction(transaction, openItems);
    const result = match ? applyMatch(transaction, match, openItems) : { transaction, openItems };
    if (match) {
      matched++;
      for (const item of result.openItems) {
        const original = openItems.find((o) => o.id === item.id);
        if (
          original &&
          (item.status !== original.status ||
            item.paid_amount !== original.paid_amount ||
            item.open_amount !== original.open_amount)
        ) {
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
          if (!res.ok) errors++;
        }
      }
      openItems = result.openItems;
    }
    const res = await fetch(`${ENGINE_URL}/api/pages`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: `legal/bank-transactions/${transaction.id}`,
        title: `Bankbuchung ${transaction.date}`,
        type: "bank_transaction",
        frontmatter: result.transaction,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) errors++;
  }
  return { imported: transactions.length, matched, errors };
}
