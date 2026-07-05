/**
 * Mahnverfahren & Zwangsvollstreckung (ZV)
 * ==========================================
 * Implements:
 * - Claim account management (Forderungskonto)
 * - § 367 BGB Verrechnung (allocation of payments)
 * - Mahnbescheid (dunning notice) application
 * - Zwangsvollstreckung (enforcement) module
 */

export interface Claim {
  id: string;
  case_slug: string;
  claimant_name: string;
  debtor_name: string;
  debtor_address?: string;
  principal_amount: number;
  interest_amount: number;
  costs_amount: number;
  total_claim: number;
  paid_amount: number;
  open_amount: number;
  interest_rate: number;
  interest_from: string;
  due_date: string;
  status:
    | "open"
    | "mahnbescheid"
    | "vollstreckungsbescheid"
    | "zwangsvollstreckung"
    | "paid"
    | "written_off";
  mahnbescheid_date?: string;
  vollstreckungsbescheid_date?: string;
  zv_date?: string;
  court?: string;
  claim_number?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentAllocation {
  payment_id: string;
  claim_id: string;
  total_payment: number;
  allocated_costs: number;
  allocated_interest: number;
  allocated_principal: number;
  remaining: number;
  allocated_at: string;
}

/**
 * § 367 BGB Verrechnung: Payments are allocated in this order:
 * 1. Costs (Kosten)
 * 2. Interest (Zinsen)
 * 3. Principal (Hauptforderung)
 */
export function allocatePayment(claim: Claim, paymentAmount: number): PaymentAllocation {
  let remaining = paymentAmount;
  const now = new Date().toISOString();

  // 1. Costs first
  const openCosts = claim.costs_amount;
  const allocatedCosts = Math.min(remaining, openCosts);
  remaining -= allocatedCosts;

  // 2. Interest second
  const openInterest = claim.interest_amount;
  const allocatedInterest = Math.min(remaining, openInterest);
  remaining -= allocatedInterest;

  // 3. Principal last
  const openPrincipal = claim.principal_amount;
  const allocatedPrincipal = Math.min(remaining, openPrincipal);
  remaining -= allocatedPrincipal;

  return {
    payment_id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    claim_id: claim.id,
    total_payment: paymentAmount,
    allocated_costs: allocatedCosts,
    allocated_interest: allocatedInterest,
    allocated_principal: allocatedPrincipal,
    remaining: Math.max(0, remaining),
    allocated_at: now,
  };
}

export function applyPaymentToClaim(claim: Claim, allocation: PaymentAllocation): Claim {
  const newPaid = claim.paid_amount + allocation.total_payment - allocation.remaining;
  const newOpen = Math.max(0, claim.total_claim - newPaid);

  return {
    ...claim,
    paid_amount: newPaid,
    open_amount: newOpen,
    costs_amount: Math.max(0, claim.costs_amount - allocation.allocated_costs),
    interest_amount: Math.max(0, claim.interest_amount - allocation.allocated_interest),
    principal_amount: Math.max(0, claim.principal_amount - allocation.allocated_principal),
    status: newOpen <= 0 ? "paid" : claim.status,
    updated_at: new Date().toISOString(),
  };
}

export function createClaim(input: {
  case_slug: string;
  claimant_name: string;
  debtor_name: string;
  debtor_address?: string;
  principal_amount: number;
  interest_amount?: number;
  costs_amount?: number;
  interest_rate?: number;
  interest_from: string;
  due_date: string;
  court?: string;
  claim_number?: string;
}): Claim {
  const now = new Date().toISOString();
  const interest = input.interest_amount ?? 0;
  const costs = input.costs_amount ?? 0;
  const total = input.principal_amount + interest + costs;

  return {
    id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: input.case_slug,
    claimant_name: input.claimant_name,
    debtor_name: input.debtor_name,
    debtor_address: input.debtor_address,
    principal_amount: input.principal_amount,
    interest_amount: interest,
    costs_amount: costs,
    total_claim: total,
    paid_amount: 0,
    open_amount: total,
    interest_rate: input.interest_rate ?? 5,
    interest_from: input.interest_from,
    due_date: input.due_date,
    status: "open",
    court: input.court,
    claim_number: input.claim_number,
    created_at: now,
    updated_at: now,
  };
}

// ── Mahnbescheid ──────────────────────────────────────────────────────

export interface MahnbescheidApplication {
  id: string;
  claim_id: string;
  court: string;
  application_date: string;
  status: "pending" | "issued" | "served" | "contested" | "final";
  served_date?: string;
  contest_deadline?: string;
  fee: number;
  created_at: string;
}

export function applyForMahnbescheid(claim: Claim, court: string): MahnbescheidApplication {
  const now = new Date().toISOString();
  return {
    id: `mb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    claim_id: claim.id,
    court,
    application_date: now,
    status: "pending",
    fee: Math.max(32, claim.open_amount * 0.01),
    created_at: now,
  };
}

export function transitionMahnbescheid(
  application: MahnbescheidApplication,
  newStatus: MahnbescheidApplication["status"],
  additionalData?: Partial<MahnbescheidApplication>
): MahnbescheidApplication {
  return {
    ...application,
    status: newStatus,
    ...additionalData,
  };
}

// ── Vollstreckungsbescheid ────────────────────────────────────────────

export function transitionToVollstreckungsbescheid(claim: Claim): Claim {
  return {
    ...claim,
    status: "vollstreckungsbescheid",
    vollstreckungsbescheid_date: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Zwangsvollstreckung ───────────────────────────────────────────────

export interface ZvMeasure {
  id: string;
  claim_id: string;
  type:
    | "pfändung_und_überweisung"
    | "pfändung_immobilien"
    | "pfändung_forderungen"
    | "zwangsversteigerung"
    | "zwangsverwaltung"
    | "eidesstattliche_versicherung";
  target: string;
  court: string;
  date: string;
  status: "beantragt" | "angeordnet" | "durchgeführt" | "aufgehoben" | "erfolglos";
  result?: string;
  amount_recovered?: number;
  costs: number;
  created_at: string;
}

export function createZvMeasure(input: {
  claim_id: string;
  type: ZvMeasure["type"];
  target: string;
  court: string;
  costs?: number;
}): ZvMeasure {
  return {
    id: `zv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    claim_id: input.claim_id,
    type: input.type,
    target: input.target,
    court: input.court,
    date: new Date().toISOString(),
    status: "beantragt",
    costs: input.costs ?? 25,
    created_at: new Date().toISOString(),
  };
}

export function transitionToZwangsvollstreckung(claim: Claim): Claim {
  return {
    ...claim,
    status: "zwangsvollstreckung",
    zv_date: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Interest Calculation ──────────────────────────────────────────────

export function calculateInterest(
  principal: number,
  rate: number,
  fromDate: string,
  toDate?: string
): number {
  const from = new Date(fromDate);
  const to = toDate ? new Date(toDate) : new Date();
  const days = Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  return (principal * rate * days) / (100 * 365);
}

// ── Status Labels ─────────────────────────────────────────────────────

const STATUS_LABELS: Record<Claim["status"], string> = {
  open: "Offen",
  mahnbescheid: "Mahnbescheid",
  vollstreckungsbescheid: "Vollstreckungsbescheid",
  zwangsvollstreckung: "Zwangsvollstreckung",
  paid: "Bezahlt",
  written_off: "Abgeschrieben",
};

export function getClaimStatusLabel(status: Claim["status"]): string {
  return STATUS_LABELS[status] ?? status;
}

const ZV_TYPE_LABELS: Record<ZvMeasure["type"], string> = {
  pfändung_und_überweisung: "Pfändungs- und Überweisungsbeschluss",
  pfändung_immobilien: "Immobilienpfändung",
  pfändung_forderungen: "Forderungspfändung",
  zwangsversteigerung: "Zwangsversteigerung",
  zwangsverwaltung: "Zwangsverwaltung",
  eidesstattliche_versicherung: "Eidesstattliche Versicherung",
};

export function getZvTypeLabel(type: ZvMeasure["type"]): string {
  return ZV_TYPE_LABELS[type] ?? type;
}
