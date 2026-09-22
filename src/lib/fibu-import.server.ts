import { ENGINE_URL } from "@/lib/engine";
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
  const params = new URLSearchParams({ type: "open_item", limit: "500" });
  const response = await fetch(`${ENGINE_URL}/api/pages?${params}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("engine_error");
  const data = await response.json();
  const pages = (Array.isArray(data) ? data : (data.pages ?? [])) as Array<{
    frontmatter: OpenItem;
  }>;
  let openItems = pages.map((page) => page.frontmatter);

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
