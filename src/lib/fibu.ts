/**
 * FiBu (Finanzbuchhaltung) — Bank-Feed, Auto-Matching, OPOS, Mahnlauf
 * ====================================================================
 * Bank transaction import with automatic matching to invoices,
 * open items (OPOS) management, and dunning run (Mahnlauf) for clients.
 */

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

export function createBankTransaction(input: {
  date: string;
  amount: number;
  direction: "debit" | "credit";
  iban: string;
  bic?: string;
  sender_name?: string;
  sender_iban?: string;
  reference?: string;
  purpose?: string;
}): BankTransaction {
  return {
    id: `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

const DUNNING_FEES = [0, 5.0, 10.0, 15.0];
const DUNNING_LABELS = ["", "Mahnung 1", "Mahnung 2", "Mahnung 3"];

export function processDunningRun(openItems: OpenItem[], currentDate?: Date): DunningRunResult[] {
  const now = currentDate ?? new Date();
  // Use UTC midnight for both now and due_date to avoid timezone skew
  // when due_date is a date-only string (e.g. "2024-01-15" parses as UTC midnight)
  const nowUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const results: DunningRunResult[] = [];

  for (const item of openItems) {
    if (item.status === "paid" || item.status === "written_off") continue;

    const dueDate = new Date(item.due_date);
    const dueUtcMidnight = new Date(
      Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate())
    );
    const daysOverdue = Math.floor(
      (nowUtcMidnight.getTime() - dueUtcMidnight.getTime()) / (1000 * 60 * 60 * 24)
    );

    let newLevel = item.dunning_level;
    let feeAdded = 0;

    if (daysOverdue > 42 && item.dunning_level < 3) {
      newLevel = 3;
      feeAdded = DUNNING_FEES[3] - item.dunning_fee;
    } else if (daysOverdue > 21 && item.dunning_level < 2) {
      newLevel = 2;
      feeAdded = DUNNING_FEES[2] - item.dunning_fee;
    } else if (daysOverdue > 7 && item.dunning_level < 1) {
      newLevel = 1;
      feeAdded = DUNNING_FEES[1] - item.dunning_fee;
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

export function getOverdueItems(openItems: OpenItem[]): OpenItem[] {
  const now = new Date();
  return openItems.filter(
    (item) =>
      item.status !== "paid" && item.status !== "written_off" && new Date(item.due_date) < now
  );
}

export function getOposSummary(openItems: OpenItem[]): {
  total: number;
  open: number;
  overdue: number;
  reminded: number;
  paid: number;
  totalOpenAmount: number;
  totalOverdueAmount: number;
} {
  const now = new Date();
  return openItems.reduce(
    (acc, item) => {
      acc.total++;
      // Round to 2 decimals to avoid float accumulation errors
      acc.totalOpenAmount = Math.round((acc.totalOpenAmount + item.open_amount) * 100) / 100;
      if (item.status === "paid") acc.paid++;
      else if (item.status === "overdue" || new Date(item.due_date) < now) {
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
