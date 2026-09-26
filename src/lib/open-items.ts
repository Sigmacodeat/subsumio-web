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
import { DUNNING_FEES, type OpenItem } from "@/lib/fibu";
import { fromCents, toCents } from "@/lib/invoice-totals";
import { brainIdFromEngineHeaders, emitInvoicePaid } from "@/lib/webhook-dispatch";

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
 * Merge-write only the changed fields of an OP. A full replace would put
 * back a stale snapshot over a concurrent write (e.g. a payment booked
 * meanwhile).
 */
async function patchOpenItem(
  headers: Record<string, string>,
  item: OpenItem,
  patch: Partial<OpenItem>
): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: `legal/open-items/${item.id}`,
      frontmatter: { ...patch, updated_at: new Date().toISOString() },
      merge: true,
    }),
    signal: AbortSignal.timeout(WRITE_TIMEOUT),
  });
  if (!res.ok) throw new Error(`open_item update failed: HTTP ${res.status}`);
}

/** The OP of an invoice, or undefined. */
export async function findOpenItemForInvoice(
  headers: Record<string, string>,
  invoiceSlug: string
): Promise<OpenItem | undefined> {
  return findByInvoice(await listOpenItems(headers), invoiceSlug);
}

export interface DunningStepPlan {
  /** Mahnstufe nach dieser Mahnung (1–3; ab der 4. Mahnung bleibt 3). */
  level: 1 | 2 | 3;
  /** Neu hinzukommende Mahnspesen (nie negativ). */
  feeAdded: number;
  /** Mahnspesen gesamt nach dieser Mahnung. */
  feeTotal: number;
  /** Offener Betrag nach dieser Mahnung (Rechnung − Zahlungen + Spesen gesamt). */
  openAmount: number;
}

/**
 * Die nächste Mahnstufe einer Rechnung — EINE Quelle für manuelle Mahnung
 * und Mahnlauf: Stufe = max(Stufe des OP, bisherige Mahnungen) + 1,
 * Spesen = kumulierter Tabellenwert der Stufe minus bereits berechnete
 * Spesen (nie negativ).
 */
export function planDunningStep(
  item: Pick<OpenItem, "dunning_level" | "dunning_fee" | "open_amount"> | undefined,
  reminderCount: number,
  invoiceTotal: number
): DunningStepPlan {
  const prevLevel = Math.max(Number(item?.dunning_level ?? 0) || 0, reminderCount || 0);
  const level = Math.min(3, prevLevel + 1) as 1 | 2 | 3;
  const feeSoFar = toCents(item?.dunning_fee ?? 0);
  const addCents = Math.max(0, toCents(DUNNING_FEES[level]) - feeSoFar);
  const openBefore = item ? toCents(item.open_amount) : toCents(invoiceTotal);
  return {
    level,
    feeAdded: fromCents(addCents),
    feeTotal: fromCents(feeSoFar + addCents),
    openAmount: fromCents(openBefore + addCents),
  };
}

/**
 * Mahnung auf den OP buchen (über /api/invoices/remind): Stufe setzen,
 * Spesen und offenen Betrag um `plan.feeAdded` erhöhen. Bank-Matching gegen
 * den gemahnten Gesamtbetrag trifft danach weiterhin exakt.
 */
export async function applyDunningStep(
  headers: Record<string, string>,
  invoiceSlug: string,
  plan: DunningStepPlan
): Promise<boolean> {
  const items = await listOpenItems(headers);
  const item = findByInvoice(items, invoiceSlug);
  if (!item || item.status === "paid" || item.status === "written_off") return false;
  const add = toCents(plan.feeAdded);
  await patchOpenItem(headers, item, {
    dunning_level: Math.max(item.dunning_level ?? 0, plan.level) as OpenItem["dunning_level"],
    dunning_fee: fromCents(toCents(item.dunning_fee) + Math.max(0, add)),
    open_amount: fromCents(toCents(item.open_amount) + Math.max(0, add)),
    dunning_date: new Date().toISOString(),
    status: plan.level >= 3 ? "overdue" : "reminded",
  });
  return true;
}

/**
 * Mahngebühr auf den OP aufschlagen (ohne Stufenwechsel). Erhöht dunning_fee
 * und open_amount um `feeDelta`.
 */
export async function applyOpenItemFee(
  headers: Record<string, string>,
  invoiceSlug: string,
  feeDelta: number
): Promise<boolean> {
  const items = await listOpenItems(headers);
  const item = findByInvoice(items, invoiceSlug);
  if (!item || item.status === "paid" || item.status === "written_off") return false;
  const fee = toCents(feeDelta);
  if (!Number.isFinite(fee) || fee <= 0) return false;

  await patchOpenItem(headers, item, {
    dunning_fee: fromCents(toCents(item.dunning_fee) + fee),
    open_amount: fromCents(toCents(item.open_amount) + fee),
    status: item.status === "open" ? "reminded" : item.status,
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

  await patchOpenItem(headers, item, {
    status: outcome,
    open_amount: outcome === "paid" ? 0 : item.open_amount,
    paid_amount:
      outcome === "paid"
        ? fromCents(toCents(item.amount) + toCents(item.dunning_fee))
        : item.paid_amount,
    ...(note ? { notes: note } : {}),
  });
  return true;
}

/**
 * Eine per Zahlungseingang ausgeglichene OP stellt ihre Rechnung auf
 * „bezahlt“ — sonst bliebe die Rechnung offen und könnte gemahnt werden.
 * Nur Prozessfelder (vom Rechnungsschutz erlaubt); nur aus sent/overdue.
 * Gibt true zurück, wenn die Rechnung umgestellt wurde.
 */
export async function markInvoicePaidFromOpenItem(
  headers: Record<string, string>,
  item: Pick<OpenItem, "invoice_id" | "paid_amount">,
  paidAt: string
): Promise<boolean> {
  const path = item.invoice_id.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
    headers,
    signal: AbortSignal.timeout(WRITE_TIMEOUT),
  });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`invoice read failed: HTTP ${res.status}`);
  const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
  const status = String(page.frontmatter?.status ?? "");
  if (status !== "sent" && status !== "overdue") return false;
  const write = await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: item.invoice_id,
      frontmatter: {
        status: "paid",
        paid_at: paidAt,
        paid_amount: item.paid_amount,
        payment_method: "bank_transfer",
      },
      merge: true,
    }),
    signal: AbortSignal.timeout(WRITE_TIMEOUT),
  });
  if (!write.ok) throw new Error(`invoice update failed: HTTP ${write.status}`);
  emitInvoicePaid(
    brainIdFromEngineHeaders(headers),
    { slug: item.invoice_id, frontmatter: page.frontmatter },
    { paid_at: paidAt, paid_amount: item.paid_amount, payment_method: "bank_transfer" }
  );
  return true;
}
