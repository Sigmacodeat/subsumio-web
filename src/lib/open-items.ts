/**
 * Offene Posten (OPOS) — Lebenszyklus aus Rechnungs-Events.
 *
 * Bisher wurde nirgends ein `open_item` erzeugt: Mahnlauf, Bank-Matching und
 * OPOS-Liste liefen über einen Datentyp, den kein Codepfad je angelegt hat.
 * Diese Lib ist die EINE Stelle, die OPs aus Rechnungs-Übergängen ableitet:
 *
 *   Rechnung "sent"  → OP anlegen (idempotent pro invoice_id)
 *   Rechnung "paid"  → OP als bezahlt abschließen
 *   Storno-Note      → OP des Originals ausbuchen ("written_off")
 *
 * Fehler werfen (throw) — der Aufrufer entscheidet, ob er fail-loud
 * (User wartet) oder best-effort-log ist. Kein stiller Datenverlust.
 */

import { ENGINE_URL } from "@/lib/engine";
import { listEnginePages } from "@/lib/engine-pages";
import type { OpenItem } from "@/lib/fibu";

interface InvoiceFrontmatterLike {
  invoice_number?: unknown;
  client?: unknown;
  client_slug?: unknown;
  total?: unknown;
  due_date?: unknown;
  case_slugs?: unknown;
}

const WRITE_TIMEOUT = 10_000;

/** Alle OPs eines Brains (paginiert — die Engine kappt Einzelrequests auf 100). */
export async function listOpenItems(headers: Record<string, string>): Promise<OpenItem[]> {
  const pages = await listEnginePages(headers, "open_item", 10_000, { strict: true });
  return pages.map((p) => p.frontmatter as unknown as OpenItem);
}

async function persistOpenItem(headers: Record<string, string>, item: OpenItem): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: `legal/open-items/${item.id}`,
      title: `OPOS: ${item.invoice_number} — ${item.client_name}`,
      type: "open_item",
      frontmatter: item,
    }),
    signal: AbortSignal.timeout(WRITE_TIMEOUT),
  });
  if (!res.ok) throw new Error(`open_item persist failed: HTTP ${res.status}`);
}

function findByInvoice(items: OpenItem[], invoiceId: string): OpenItem | undefined {
  return items.find((i) => i.invoice_id === invoiceId);
}

/**
 * OP für eine versendete Rechnung anlegen. Idempotent: existiert schon ein
 * OP (nicht written_off) für die Rechnung, wird nichts angelegt.
 */
export async function createOpenItemForInvoice(
  headers: Record<string, string>,
  invoiceSlug: string,
  fm: InvoiceFrontmatterLike
): Promise<{ created: boolean; item?: OpenItem }> {
  const items = await listOpenItems(headers);
  const existing = findByInvoice(items, invoiceSlug);
  if (existing && existing.status !== "written_off") return { created: false, item: existing };

  const total = Number(fm.total ?? 0);
  if (!Number.isFinite(total) || total <= 0) return { created: false };

  const caseSlugs = Array.isArray(fm.case_slugs) ? fm.case_slugs : [];
  const now = new Date().toISOString();
  const item: OpenItem = {
    id: `opos-${invoiceSlug.replace(/[^a-zA-Z0-9-]/g, "-")}`,
    invoice_id: invoiceSlug,
    invoice_number: String(fm.invoice_number ?? invoiceSlug),
    case_slug: caseSlugs.length > 0 ? String(caseSlugs[0]) : undefined,
    client_name: String(fm.client ?? ""),
    client_email: undefined,
    amount: total,
    paid_amount: 0,
    open_amount: total,
    due_date: String(fm.due_date ?? now.slice(0, 10)),
    dunning_level: 0,
    dunning_fee: 0,
    status: "open",
    created_at: now,
    updated_at: now,
  };
  await persistOpenItem(headers, item);
  return { created: true, item };
}

/**
 * Mahngebühr auf den OP aufschlagen (Mahnung über /api/invoices/remind).
 * Erhöht dunning_fee und open_amount um `feeDelta`, damit Bank-Matching
 * gegen den gemahnten Gesamtbetrag weiterhin exakt trifft.
 */
export async function applyOpenItemFee(
  headers: Record<string, string>,
  invoiceSlug: string,
  feeDelta: number
): Promise<boolean> {
  const items = await listOpenItems(headers);
  const item = findByInvoice(items, invoiceSlug);
  if (!item || item.status === "paid" || item.status === "written_off") return false;
  const fee = Math.round(feeDelta * 100) / 100;
  if (!Number.isFinite(fee) || fee <= 0) return false;

  await persistOpenItem(headers, {
    ...item,
    dunning_fee: Math.round((item.dunning_fee + fee) * 100) / 100,
    open_amount: Math.round((item.open_amount + fee) * 100) / 100,
    status: item.status === "open" ? "reminded" : item.status,
    updated_at: new Date().toISOString(),
  });
  return true;
}

/**
 * OP einer Rechnung ausbuchen — Zahlung ("paid") oder Storno ("written_off").
 * Gibt true zurück, wenn ein OP aktualisiert wurde. Ein fehlender OP ist kein
 * Fehler (Rechnung ggf. vor OPOS-Einführung versendet).
 */
export async function closeOpenItemForInvoice(
  headers: Record<string, string>,
  invoiceSlug: string,
  outcome: "paid" | "written_off",
  note?: string
): Promise<boolean> {
  const items = await listOpenItems(headers);
  const item = findByInvoice(items, invoiceSlug);
  if (!item || item.status === "paid" || item.status === "written_off") return false;

  const updated: OpenItem = {
    ...item,
    status: outcome,
    open_amount: outcome === "paid" ? 0 : item.open_amount,
    paid_amount: outcome === "paid" ? item.amount + item.dunning_fee : item.paid_amount,
    updated_at: new Date().toISOString(),
    ...(note ? { notes: note } : {}),
  };
  await persistOpenItem(headers, updated);
  return true;
}
