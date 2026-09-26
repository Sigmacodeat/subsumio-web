/**
 * FiBu (Finanzbuchhaltung) — Bank-Feed, Auto-Matching, OPOS, Mahnlauf
 * ====================================================================
 * Bank transaction import with automatic matching to invoices,
 * open items (OPOS) management, and dunning run (Mahnlauf) for clients.
 */

import { zonedDateString } from "@/lib/datetime";

export interface BankTransaction {
  id: string;
  date: string;
  amount: number;
  direction: "debit" | "credit";
  iban: string;
  bic?: string;
  sender_name?: string;
  sender_iban?: string;
  reference?: string;
  purpose?: string;
  matched_invoice_id?: string;
  matched_case_slug?: string;
  match_confidence?: "high" | "medium" | "low" | "unmatched";
  status: "unmatched" | "matched" | "ignored";
  imported_at: string;
}

export interface OpenItem {
  id: string;
  invoice_id: string;
  invoice_number: string;
  case_slug?: string;
  client_name: string;
  client_email?: string;
  amount: number;
  paid_amount: number;
  open_amount: number;
  due_date: string;
  dunning_level: 0 | 1 | 2 | 3;
  dunning_date?: string;
  dunning_fee: number;
  status: "open" | "reminded" | "overdue" | "paid" | "written_off";
  /**
   * Mahnvorschlag des Mahnlaufs: diese Stufe ist fällig, die Mahnung wird
   * aber erst über „Mahnen“ versendet (erst dann Stufe + Spesen).
   */
  dunning_suggested_level?: 1 | 2 | 3;
  dunning_suggested_at?: string;
  /** Grund der Ausbuchung (z.B. Storno-Noten-Nummer) — nur informativ. */
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MatchResult {
  transaction: BankTransaction;
  invoice_id?: string;
  case_slug?: string;
  confidence: "high" | "medium" | "low";
  matchReason: string;
}

/** FNV-1a style hash (2×32 bit) — stable and synchronous, keys a booking. */
function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x5bd1e995;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function compact(value: string | undefined): string {
  return (value ?? "").split(/\s+/).filter(Boolean).join(" ");
}

export interface BankTransactionInput {
  date: string;
  amount: number;
  direction: "debit" | "credit";
  iban: string;
  bic?: string;
  sender_name?: string;
  sender_iban?: string;
  reference?: string;
  purpose?: string;
}

export interface BankTransactionIdOptions {
  /** The bank's own unique reference (camt AcctSvcrRef, feed transaction id). */
  bankRef?: string;
  /** Running number among identical bookings of one statement. */
  occurrence?: number;
}

/**
 * Deterministic id of a bank booking. The same booking imported twice
 * (double click, overlapping daily/monthly statements, feed + file) gets the
 * same id, so the second import is recognised as a duplicate instead of
 * paying the open item a second time.
 *
 * With the bank's own reference the id is derived from account + reference;
 * otherwise from account, booking date, amount in cents, direction,
 * counter-account, reference, purpose and the running number among identical
 * bookings — two genuinely separate identical payments stay two.
 */
export function bankTransactionId(
  input: BankTransactionInput,
  opts: BankTransactionIdOptions = {}
): string {
  const iban = compact(input.iban).replace(/ /g, "").toUpperCase();
  const ref = compact(opts.bankRef);
  if (ref) return `txn-${stableHash(`ref|${iban}|${ref}`)}`;
  const fingerprint = [
    iban,
    (input.date ?? "").slice(0, 10),
    Math.round((Number(input.amount) || 0) * 100),
    input.direction,
    compact(input.sender_iban).replace(/ /g, "").toUpperCase(),
    compact(input.reference),
    compact(input.purpose),
    opts.occurrence ?? 0,
  ].join("|");
  return `txn-${stableHash(fingerprint)}`;
}

/**
 * Inputs of one import with their running number among identical bookings
 * (input order = statement order).
 */
export function withOccurrence<T extends BankTransactionInput>(
  inputs: T[]
): Array<{ input: T; occurrence: number }> {
  const seen = new Map<string, number>();
  return inputs.map((input) => {
    const key = bankTransactionId(input);
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return { input, occurrence };
  });
}

export function createBankTransaction(
  input: BankTransactionInput,
  opts: BankTransactionIdOptions = {}
): BankTransaction {
  return {
    id: bankTransactionId(input, opts),
    date: input.date,
    amount: input.amount,
    direction: input.direction,
    iban: input.iban,
    bic: input.bic,
    sender_name: input.sender_name,
    sender_iban: input.sender_iban,
    reference: input.reference,
    purpose: input.purpose,
    status: "unmatched",
    imported_at: new Date().toISOString(),
  };
}

/**
 * Auto-match bank transactions to invoices/open items.
 * Matching criteria (in order of confidence):
 * 1. Invoice number in reference/purpose (high)
 * 2. Exact amount match + case slug in reference (high)
 * 3. Exact amount match (medium)
 * 4. Partial amount match within 5% (low)
 */
export function autoMatchTransaction(
  txn: BankTransaction,
  openItems: OpenItem[]
): MatchResult | null {
  if (txn.direction !== "credit") return null;

  const searchText =
    `${txn.reference ?? ""} ${txn.purpose ?? ""} ${txn.sender_name ?? ""}`.toLowerCase();

  // Items that are eligible for matching (not paid, not written off)
  const eligibleItems = openItems.filter(
    (item) => item.status !== "paid" && item.status !== "written_off"
  );

  // 1. Invoice number in reference — require minimum length to avoid
  //    false positives (e.g. invoice number "1" matching everything).
  //    Also prefer the LONGEST matching invoice number to avoid
  //    "RE-2024-01" matching when "RE-2024-012" is the real target.
  const invoiceNumberMatches: { item: OpenItem; reason: string }[] = [];
  for (const item of eligibleItems) {
    const invNumLower = item.invoice_number.toLowerCase();
    // Require at least 4 chars to avoid trivial matches
    if (invNumLower.length >= 4 && searchText.includes(invNumLower)) {
      invoiceNumberMatches.push({
        item,
        reason: `Rechnungsnummer ${item.invoice_number} in Verwendungszweck gefunden`,
      });
    }
  }
  if (invoiceNumberMatches.length > 0) {
    // Sort by invoice_number length descending — longest match wins
    invoiceNumberMatches.sort(
      (a, b) => b.item.invoice_number.length - a.item.invoice_number.length
    );
    const best = invoiceNumberMatches[0]!;
    return {
      transaction: txn,
      invoice_id: best.item.invoice_id,
      case_slug: best.item.case_slug,
      confidence: "high",
      matchReason: best.reason,
    };
  }

  // 2. Case slug in reference + exact amount
  for (const item of eligibleItems) {
    if (!item.case_slug) continue;
    if (
      searchText.includes(item.case_slug.toLowerCase()) &&
      Math.abs(txn.amount - item.open_amount) < 0.01
    ) {
      return {
        transaction: txn,
        invoice_id: item.invoice_id,
        case_slug: item.case_slug,
        confidence: "high",
        matchReason: `Aktenzeichen ${item.case_slug} + Betrag ${txn.amount.toFixed(2)}€ stimmen überein`,
      };
    }
  }

  // 3. Exact amount match
  for (const item of eligibleItems) {
    if (Math.abs(txn.amount - item.open_amount) < 0.01) {
      return {
        transaction: txn,
        invoice_id: item.invoice_id,
        case_slug: item.case_slug,
        confidence: "medium",
        matchReason: `Betrag ${txn.amount.toFixed(2)}€ stimmt mit Rechnung ${item.invoice_number} überein`,
      };
    }
  }

  // 4. Partial amount match within 5%
  for (const item of eligibleItems) {
    const diff = Math.abs(txn.amount - item.open_amount);
    if (diff > 0 && item.open_amount > 0 && diff / item.open_amount <= 0.05) {
      return {
        transaction: txn,
        invoice_id: item.invoice_id,
        case_slug: item.case_slug,
        confidence: "low",
        matchReason: `Betrag ${txn.amount.toFixed(2)}€ ≈ Rechnung ${item.invoice_number} (${item.open_amount.toFixed(2)}€)`,
      };
    }
  }

  return null;
}

export function applyMatch(
  txn: BankTransaction,
  match: MatchResult,
  openItems: OpenItem[]
): { transaction: BankTransaction; openItems: OpenItem[]; surplus: number } {
  const updatedTxn: BankTransaction = {
    ...txn,
    matched_invoice_id: match.invoice_id,
    matched_case_slug: match.case_slug,
    match_confidence: match.confidence,
    status: "matched",
  };

  let surplus = 0;
  const updatedItems = openItems.map((item) => {
    if (item.invoice_id !== match.invoice_id) return item;
    const newPaidAmount = item.paid_amount + txn.amount;
    const totalDue = item.amount + item.dunning_fee;
    const newOpenAmount = Math.max(0, totalDue - newPaidAmount);
    // Track surplus (overpayment) — previously lost silently via Math.max(0, ...)
    if (newPaidAmount > totalDue) {
      surplus = newPaidAmount - totalDue;
    }
    return {
      ...item,
      paid_amount: Math.min(newPaidAmount, totalDue),
      open_amount: newOpenAmount,
      status: newOpenAmount <= 0 ? ("paid" as const) : item.status,
      updated_at: new Date().toISOString(),
    };
  });

  return { transaction: updatedTxn, openItems: updatedItems, surplus };
}

// ── OPOS (Open Items) Management ──────────────────────────────────────

export function createOpenItem(input: {
  invoice_id: string;
  invoice_number: string;
  case_slug?: string;
  client_name: string;
  client_email?: string;
  amount: number;
  due_date: string;
}): OpenItem {
  const now = new Date().toISOString();
  return {
    id: `opos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    invoice_id: input.invoice_id,
    invoice_number: input.invoice_number,
    case_slug: input.case_slug,
    client_name: input.client_name,
    client_email: input.client_email,
    amount: input.amount,
    paid_amount: 0,
    open_amount: input.amount,
    due_date: input.due_date,
    dunning_level: 0,
    dunning_fee: 0,
    status: "open",
    created_at: now,
    updated_at: now,
  };
}

// ── Mahnlauf (Dunning Run) ────────────────────────────────────────────

export interface DunningRunResult {
  item_id: string;
  invoice_number: string;
  client_name: string;
  old_level: number;
  new_level: number;
  fee_added: number;
  new_status: OpenItem["status"];
  email_sent: boolean;
}

/**
 * EINZIGE Mahngebühren-Tabelle der Anwendung (Kumulativ-Summe je Stufe).
 * Auch /api/invoices/remind rechnet über diese Tabelle (dunningFeeDelta) —
 * die frühere eigene Formel dort (mind. 20/40/60 € bzw. 50–130 % des
 * Rechnungsbetrags) war als Verzugsschaden nicht durchsetzbar.
 *
 * Rechtliche Einordnung (DACH): Die § 288 Abs. 5 BGB-Pauschale von 40 € gilt
 * nur für B2B-Entgeltforderungen und nur einmal pro Forderung — nicht als
 * Stufenmodell. Für gemischte Mandanten (B2C/B2B) sind moderate Pauschal-
 * gebühren je Mahnstufe die konservative, in DE und AT gerichtsfest
 * akzeptierte Praxis. Deckel bei 15 € gesamt: ab Stufe 3 ist ohnehin das
 * gerichtliche Mahnverfahren/Inkasso der vorgesehene nächste Schritt.
 * Bestehende Rechnungen/OPs bleiben unverändert — die Tabelle wirkt nur
 * auf neu geschriebene Mahngebühren.
 */
export const DUNNING_FEES = [0, 5.0, 10.0, 15.0];
const DUNNING_LABELS = ["", "Mahnung 1", "Mahnung 2", "Mahnung 3"];

/**
 * Gebühren-Delta beim Erreichen von Mahnstufe `level` (1-basiert):
 * DUNNING_FEES[level] − DUNNING_FEES[level−1], 0 für level < 1 oder über
 * dem Deckel (keine weitere Pauschale ab der 4. Mahnung).
 */
export function dunningFeeDelta(level: number): number {
  const l = Math.floor(level);
  if (l < 1 || l >= DUNNING_FEES.length) return 0;
  return DUNNING_FEES[l] - DUNNING_FEES[l - 1];
}

/** Whole calendar days from `fromIso` to `toIso` (both "YYYY-MM-DD"). */
function calendarDaysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Cumulative fee of `level` minus what was already charged — never negative. */
function feeToReach(level: number, chargedSoFar: number): number {
  const target = Math.round((DUNNING_FEES[level] ?? 0) * 100);
  const charged = Math.round((Number(chargedSoFar) || 0) * 100);
  return Math.max(0, target - charged) / 100;
}

export function processDunningRun(openItems: OpenItem[], currentDate?: Date): DunningRunResult[] {
  // The firm's calendar day (Europe/Vienna) — a due date is a plain date,
  // never UTC midnight.
  const today = zonedDateString(currentDate ?? new Date());
  const results: DunningRunResult[] = [];

  for (const item of openItems) {
    if (item.status === "paid" || item.status === "written_off") continue;

    const daysOverdue = calendarDaysBetween(item.due_date, today);

    let newLevel = item.dunning_level;
    let feeAdded = 0;

    if (daysOverdue > 42 && item.dunning_level < 3) {
      newLevel = 3;
      feeAdded = feeToReach(3, item.dunning_fee);
    } else if (daysOverdue > 21 && item.dunning_level < 2) {
      newLevel = 2;
      feeAdded = feeToReach(2, item.dunning_fee);
    } else if (daysOverdue > 7 && item.dunning_level < 1) {
      newLevel = 1;
      feeAdded = feeToReach(1, item.dunning_fee);
    }

    if (newLevel === item.dunning_level) continue;

    const newStatus: OpenItem["status"] = newLevel >= 3 ? "overdue" : "reminded";

    results.push({
      item_id: item.id,
      invoice_number: item.invoice_number,
      client_name: item.client_name,
      old_level: item.dunning_level,
      new_level: newLevel,
      fee_added: feeAdded,
      new_status: newStatus,
      email_sent: Boolean(item.client_email),
    });
  }

  return results;
}

export function applyDunningRun(openItems: OpenItem[], results: DunningRunResult[]): OpenItem[] {
  const resultMap = new Map(results.map((r) => [r.item_id, r]));
  return openItems.map((item) => {
    const result = resultMap.get(item.id);
    if (!result) return item;
    return {
      ...item,
      dunning_level: result.new_level as OpenItem["dunning_level"],
      dunning_fee: item.dunning_fee + result.fee_added,
      open_amount: item.open_amount + result.fee_added,
      dunning_date: new Date().toISOString(),
      status: result.new_status,
      updated_at: new Date().toISOString(),
    };
  });
}

export function getDunningLabel(level: number): string {
  return DUNNING_LABELS[level] ?? "";
}

/**
 * Overdue = the due date lies before the firm's today (Europe/Vienna). On the
 * due date itself the item is still in time.
 */
export function isPastDue(dueDate: string, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  return dueDate.slice(0, 10) < zonedDateString(now);
}

export function getOverdueItems(openItems: OpenItem[], now: Date = new Date()): OpenItem[] {
  return openItems.filter(
    (item) =>
      item.status !== "paid" && item.status !== "written_off" && isPastDue(item.due_date, now)
  );
}

export function getOposSummary(
  openItems: OpenItem[],
  now: Date = new Date()
): {
  total: number;
  open: number;
  overdue: number;
  reminded: number;
  paid: number;
  totalOpenAmount: number;
  totalOverdueAmount: number;
} {
  return openItems.reduce(
    (acc, item) => {
      acc.total++;
      // A written-off item (Storno) is no receivable any more.
      if (item.status === "written_off") return acc;
      // Round to 2 decimals to avoid float accumulation errors
      acc.totalOpenAmount = Math.round((acc.totalOpenAmount + item.open_amount) * 100) / 100;
      if (item.status === "paid") acc.paid++;
      else if (item.status === "overdue" || isPastDue(item.due_date, now)) {
        acc.overdue++;
        acc.totalOverdueAmount =
          Math.round((acc.totalOverdueAmount + item.open_amount) * 100) / 100;
      } else if (item.status === "reminded") acc.reminded++;
      else acc.open++;
      return acc;
    },
    {
      total: 0,
      open: 0,
      overdue: 0,
      reminded: 0,
      paid: 0,
      totalOpenAmount: 0,
      totalOverdueAmount: 0,
    }
  );
}
