/**
 * Mahnverfahren & Zwangsvollstreckung (ZV)
 * ==========================================
 * Implements:
 * - Claim account management (Forderungskonto)
 * - § 367 BGB Verrechnung (allocation of payments)
 * - Mahnbescheid (dunning notice) application
 * - Zwangsvollstreckung (enforcement) module
 */

export type ClaimJurisdiction = "at" | "de";

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
  /** Rechtsraum — steuert Bezeichnungen (Mahnklage vs. Mahnbescheid)
   *  und die Antragsdaten (EKV vs. Mahnverfahren §§ 688 ff. ZPO). */
  jurisdiction?: ClaimJurisdiction;
  mahnbescheid_date?: string;
  vollstreckungsbescheid_date?: string;
  zv_date?: string;
  court?: string;
  claim_number?: string;
  /** Aktive Ratenvereinbarung (eine pro Forderung). */
  installment_plan?: InstallmentPlan;
  /** Beantragte/bewilligte Exekutionsmaßnahmen. */
  zv_measures?: ZvMeasure[];
  /** Zuletzt erzeugte Antragsdaten (Mahnklage/Mahnbescheid/Exekution). */
  last_antrag?: AntragsDaten;
  /** Ursprüngliche Hauptforderung (principal_amount ist der offene Rest). */
  original_principal_amount?: number;
  /** Zahlungsjournal: jeder Eingang mit Anrechnung (§ 1416 ABGB), Nutzer und Zeit. */
  payments?: ClaimPaymentRecord[];
  /** Überzahlung — Guthaben des Schuldners, nicht verfallen. */
  credit_balance?: number;
  created_at: string;
  updated_at: string;
}

export interface ClaimPaymentRecord {
  id: string;
  /** Tag des Zahlungseingangs (YYYY-MM-DD). */
  date: string;
  amount: number;
  allocated_costs: number;
  allocated_interest: number;
  allocated_principal: number;
  /** Überzahlung dieser Zahlung (→ credit_balance). */
  surplus: number;
  booked_by?: string;
  booked_at: string;
  /** Zahlung auf eine Rate des Ratenplans. */
  installment?: boolean;
}

const c = (n: unknown): number => Math.round((Number(n) || 0) * 100);
const eur = (cents: number): number => Math.round(cents) / 100;

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
 * Tilgungsreihenfolge (§ 1415 ABGB, identisch § 367 BGB): Payments are
 * allocated in this order:
 * 1. Costs (Kosten)
 * 2. Interest (Zinsen)
 * 3. Principal (Hauptforderung)
 */
export function allocatePayment(claim: Claim, paymentAmount: number): PaymentAllocation {
  // In whole cents — no float remainders in the account.
  let remaining = c(paymentAmount);
  const now = new Date().toISOString();

  // 1. Costs first
  const allocatedCosts = Math.min(remaining, Math.max(0, c(claim.costs_amount)));
  remaining -= allocatedCosts;

  // 2. Interest second
  const allocatedInterest = Math.min(remaining, Math.max(0, c(claim.interest_amount)));
  remaining -= allocatedInterest;

  // 3. Principal last
  const allocatedPrincipal = Math.min(remaining, Math.max(0, c(claim.principal_amount)));
  remaining -= allocatedPrincipal;

  return {
    payment_id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    claim_id: claim.id,
    total_payment: eur(c(paymentAmount)),
    allocated_costs: eur(allocatedCosts),
    allocated_interest: eur(allocatedInterest),
    allocated_principal: eur(allocatedPrincipal),
    remaining: eur(Math.max(0, remaining)),
    allocated_at: now,
  };
}

/**
 * Book an allocated payment on the claim. The open parts shrink, the
 * original principal stays recorded, an overpayment is kept as the
 * debtor's credit (never silently dropped).
 */
export function applyPaymentToClaim(claim: Claim, allocation: PaymentAllocation): Claim {
  const credited = c(allocation.total_payment) - c(allocation.remaining);
  const newPaid = c(claim.paid_amount) + credited;
  const newOpen = Math.max(0, c(claim.total_claim) - newPaid);

  return {
    ...claim,
    original_principal_amount: claim.original_principal_amount ?? claim.principal_amount,
    paid_amount: eur(newPaid),
    open_amount: eur(newOpen),
    costs_amount: eur(Math.max(0, c(claim.costs_amount) - c(allocation.allocated_costs))),
    interest_amount: eur(Math.max(0, c(claim.interest_amount) - c(allocation.allocated_interest))),
    principal_amount: eur(
      Math.max(0, c(claim.principal_amount) - c(allocation.allocated_principal))
    ),
    credit_balance: eur(c(claim.credit_balance) + c(allocation.remaining)),
    status: newOpen <= 0 ? "paid" : claim.status,
    updated_at: new Date().toISOString(),
  };
}

/** Journal entry of a booked payment. */
export function paymentRecord(
  allocation: PaymentAllocation,
  input: { date: string; bookedBy?: string; installment?: boolean }
): ClaimPaymentRecord {
  return {
    id: allocation.payment_id,
    date: input.date,
    amount: allocation.total_payment,
    allocated_costs: allocation.allocated_costs,
    allocated_interest: allocation.allocated_interest,
    allocated_principal: allocation.allocated_principal,
    surplus: allocation.remaining,
    booked_by: input.bookedBy,
    booked_at: allocation.allocated_at,
    ...(input.installment ? { installment: true } : {}),
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
  jurisdiction?: ClaimJurisdiction;
}): Claim {
  const now = new Date().toISOString();
  const principal = eur(c(input.principal_amount));
  const interest = eur(c(input.interest_amount ?? 0));
  const costs = eur(c(input.costs_amount ?? 0));
  const total = eur(c(principal) + c(interest) + c(costs));

  return {
    id: `claim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: input.case_slug,
    claimant_name: input.claimant_name,
    debtor_name: input.debtor_name,
    debtor_address: input.debtor_address,
    principal_amount: principal,
    original_principal_amount: principal,
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
    jurisdiction: input.jurisdiction,
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

// ── Ratenvereinbarung ─────────────────────────────────────────────────

export interface Installment {
  index: number;
  due_date: string; // ISO YYYY-MM-DD
  amount: number;
  paid_amount: number;
  status: "offen" | "teilbezahlt" | "bezahlt" | "überfällig";
}

export interface InstallmentPlan {
  id: string;
  created_at: string;
  /** Verfallsklausel: bei Verzug einer Rate um > graceDays Tage wird der
   *  Gesamtbetrag sofort fällig (übliche Kanzlei-Formulierung). */
  graceDays: number;
  installments: Installment[];
}

export class InstallmentPlanError extends Error {}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const target = d.getUTCMonth() + months;
  const y = d.getUTCFullYear() + Math.floor(target / 12);
  const m = ((target % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), last);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Erzeugt einen Ratenplan über den offenen Restbetrag. Erste Rate fällig
 * am `startIso`, weitere monatlich. Rundungsrest geht auf die letzte Rate.
 */
export function createInstallmentPlan(
  claim: Claim,
  opts: { count: number; startIso: string; graceDays?: number }
): InstallmentPlan {
  const { count, startIso } = opts;
  const graceDays = opts.graceDays ?? 14;
  if (!Number.isInteger(count) || count < 2 || count > 60) {
    throw new InstallmentPlanError("Ratenanzahl muss zwischen 2 und 60 liegen.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso)) {
    throw new InstallmentPlanError("Startdatum muss ISO YYYY-MM-DD sein.");
  }
  const open = claim.open_amount;
  if (open <= 0) throw new InstallmentPlanError("Kein offener Betrag vorhanden.");

  const base = Math.floor((open / count) * 100) / 100;
  const installments: Installment[] = [];
  let assigned = 0;
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const amount = isLast ? Math.round((open - assigned) * 100) / 100 : base;
    assigned += amount;
    installments.push({
      index: i,
      due_date: addMonthsIso(startIso, i),
      amount,
      paid_amount: 0,
      status: "offen",
    });
  }
  return {
    id: `raten-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    created_at: new Date().toISOString(),
    graceDays,
    installments,
  };
}

/** Aktualisiert Rate-Status anhand des Stichtags (überfällig-Markierung). */
export function refreshInstallmentStatuses(
  plan: InstallmentPlan,
  todayIso: string
): InstallmentPlan {
  return {
    ...plan,
    installments: plan.installments.map((inst) => {
      if (inst.status === "bezahlt") return inst;
      const overdue = inst.due_date < todayIso && inst.paid_amount < inst.amount;
      return {
        ...inst,
        status:
          inst.paid_amount >= inst.amount
            ? "bezahlt"
            : inst.paid_amount > 0
              ? "teilbezahlt"
              : overdue
                ? "überfällig"
                : "offen",
      };
    }),
  };
}

/** Bucht eine Zahlung auf die älteste offene Rate. */
export function applyInstallmentPayment(
  plan: InstallmentPlan,
  amount: number
): { plan: InstallmentPlan; applied: number } {
  let remaining = amount;
  const installments = plan.installments.map((inst) => {
    if (remaining <= 0 || inst.paid_amount >= inst.amount) return inst;
    const openInst = inst.amount - inst.paid_amount;
    const pay = Math.min(openInst, remaining);
    remaining -= pay;
    const paid = inst.paid_amount + pay;
    const status: Installment["status"] = paid >= inst.amount ? "bezahlt" : "teilbezahlt";
    return { ...inst, paid_amount: paid, status };
  });
  return { plan: { ...plan, installments }, applied: amount - remaining };
}

/** Verfallsklausel-Prüfung: eine Rate > graceDays überfällig → Gesamtbetrag fällig. */
export function isInstallmentPlanDefaulted(plan: InstallmentPlan, todayIso: string): boolean {
  return plan.installments.some(
    (inst) => inst.paid_amount < inst.amount && addDaysIso(inst.due_date, plan.graceDays) < todayIso
  );
}

// ── Antrags-Vorbereitung (AT: EKV / DE: Online-Mahnantrag) ─────────────

export type AntragArt = "mahnklage" | "mahnbescheid" | "exekution";

export interface AntragsDaten {
  art: AntragArt;
  jurisdiction: ClaimJurisdiction;
  /** Zuständige Stelle — AT: Bezirksgericht (EKV) bzw. allgemeines
   *  Exekutionsgericht; DE: zentrales Mahngericht des Bundeslandes. */
  gericht: string;
  antragsteller: { name: string; rolle: string };
  gegner: { name: string; adresse?: string };
  forderung: {
    hauptforderung: number;
    zinsen: number;
    zinsen_prozent: number;
    zinsen_laufend_ab: string;
    kosten: number;
    gesamt: number;
    offen: number;
  };
  /** Gesetzliche Grundlage des Verfahrens. */
  rechtsgrundlage: string;
  /** Hinweise für die anwaltliche Prüfung vor Einbringung. */
  hinweise: string[];
  /** Vorbefüllter Antragstext — Grundlage für EKV-Eingabe oder DOCX-Render. */
  antragstext: string;
}

const fmtEur = (n: number) =>
  n.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Mahnklage (AT, §§ 244 ff. ZPO — zwingend bis € 75.000) bzw.
 * Mahnbescheid (DE, §§ 688 ff. ZPO). Erzeugt die Antragsdaten für den
 * EKV-/Online-Eintrag — die Einbringung selbst erfolgt durch die Kanzlei.
 */
export function buildMahnAntrag(
  claim: Claim,
  opts: { jurisdiction: ClaimJurisdiction; gericht: string }
): AntragsDaten {
  const { jurisdiction, gericht } = opts;
  const open = claim.open_amount;
  if (open <= 0) throw new InstallmentPlanError("Kein offener Betrag vorhanden.");

  if (jurisdiction === "at") {
    const hinweise = [
      "Mahnklage ist bei Geldforderungen bis € 75.000 zwingend (§ 244 ZPO) — darüber ordentliche Klage.",
      "Zinsen laufend seit Fälligkeit mit dem vereinbarten/gesetzlichen Satz fortführen.",
      "Betreibungspauschale € 40 (§ 458 UGB) nur bei unternehmerischer Forderung einrechnen.",
      "EKV-Eingabe im Verfügungsbereich des Anwalts; Postulatorzwang beachten.",
    ];
    const antragstext =
      `MAHNKLAGE (§§ 244 ff. ZPO)\n\n` +
      `An das ${gericht}\n\n` +
      `Kläger:in: ${claim.claimant_name}\n` +
      `Beklagte:r: ${claim.debtor_name}${claim.debtor_address ? `, ${claim.debtor_address}` : ""}\n\n` +
      `FORDERUNG:\n` +
      `  Hauptforderung: ${fmtEur(claim.principal_amount)} €\n` +
      `  Zinsen bis Stichtag: ${fmtEur(claim.interest_amount)} €\n` +
      `  Kosten: ${fmtEur(claim.costs_amount)} €\n` +
      `  aushaftend: ${fmtEur(open)} €\n` +
      `  zuzüglich ${claim.interest_rate} % Zinsen p.a. ab ${claim.interest_from}\n\n` +
      `Fälligkeit: ${claim.due_date}\n` +
      (claim.claim_number ? `Geschäftszahl Akte: ${claim.claim_number}\n` : "") +
      `\nDie Beklagte Partei wird zur Zahlung von ${fmtEur(open)} € samt ` +
      `laufenden Zinsen und Kosten verpflichtet.`;
    return {
      art: "mahnklage",
      jurisdiction,
      gericht,
      antragsteller: { name: claim.claimant_name, rolle: "Kläger:in" },
      gegner: { name: claim.debtor_name, adresse: claim.debtor_address },
      forderung: {
        hauptforderung: claim.principal_amount,
        zinsen: claim.interest_amount,
        zinsen_prozent: claim.interest_rate,
        zinsen_laufend_ab: claim.interest_from,
        kosten: claim.costs_amount,
        gesamt: claim.total_claim,
        offen: open,
      },
      rechtsgrundlage: "§§ 244 ff. ZPO (Mahnklage); Eingabe via EKV",
      hinweise,
      antragstext,
    };
  }

  const hinweise = [
    "Online-Mahnantrag beim zentralen Mahngericht des Bundeslandes (§§ 688 ff. ZPO).",
    "Hauptanspruch + Zinsen + Nebenforderungen getrennt ausweisen (§ 691 Abs. 1 ZPO).",
    "Zinsen fortlaufend als Nebenanspruch anmelden.",
    "Nach Widerspruchslosigkeit Vollstreckungsbescheid beantragen (§ 699 ZPO).",
  ];
  const antragstext =
    `ANTRAG AUF ERLASS EINES MAHNBESCHEIDS (§§ 688 ff. ZPO)\n\n` +
    `Zentrales Mahngericht: ${gericht}\n\n` +
    `Antragsteller:in: ${claim.claimant_name}\n` +
    `Antragsgegner:in: ${claim.debtor_name}${claim.debtor_address ? `, ${claim.debtor_address}` : ""}\n\n` +
    `HAUPTANSPRUCH: ${fmtEur(claim.principal_amount)} €\n` +
    `NEBENANSPRÜCHE: Zinsen ${fmtEur(claim.interest_amount)} € ` +
    `(laufend ${claim.interest_rate} % p.a. ab ${claim.interest_from}), ` +
    `Kosten ${fmtEur(claim.costs_amount)} €\n` +
    `GESAMT offen: ${fmtEur(open)} €`;
  return {
    art: "mahnbescheid",
    jurisdiction,
    gericht,
    antragsteller: { name: claim.claimant_name, rolle: "Antragsteller:in" },
    gegner: { name: claim.debtor_name, adresse: claim.debtor_address },
    forderung: {
      hauptforderung: claim.principal_amount,
      zinsen: claim.interest_amount,
      zinsen_prozent: claim.interest_rate,
      zinsen_laufend_ab: claim.interest_from,
      kosten: claim.costs_amount,
      gesamt: claim.total_claim,
      offen: open,
    },
    rechtsgrundlage: "§§ 688 ff. ZPO (Mahnbescheid); Online-Mahnantrag",
    hinweise,
    antragstext,
  };
}

/**
 * Exekutionsantrag (AT, §§ 3 ff. EO) bzw. ZV-Antrag (DE, §§ 750 ff. ZPO).
 * Voraussetzung: vollstreckbarer Titel (rechtskräftiger Zahlungsbefehl/
 * Vollstreckungsbescheid bzw. Urteil).
 */
export function buildExekutionsantrag(
  claim: Claim,
  measure: ZvMeasure,
  opts: { jurisdiction: ClaimJurisdiction; gericht: string; titel: string }
): AntragsDaten {
  const { jurisdiction, gericht, titel } = opts;
  const open = claim.open_amount;

  if (jurisdiction === "at") {
    const mittelLabel = getZvTypeLabel(measure.type, jurisdiction);
    const hinweise = [
      "Voraussetzung: vollstreckbarer Titel (rechtskräftiger Zahlungsbefehl, Urteil, Exekutionsbewilligung).",
      "Allgemeines Exekutionsgericht: Gericht des allgemeinen Gerichtsstands der verpflichteten Person (§ 17 EO).",
      "Bei Fahrnisexekution bewegliche Sachen bezeichnen; bei Forderungsexekution Drittschuldner angeben.",
      "Exekutionsgebühr und Kosten nach GGG — Gebührenvorschuss einplanen.",
    ];
    const antragstext =
      `EXEKUTIONSANTRAG (§§ 3 ff. EO)\n\n` +
      `An das ${gericht}\n\n` +
      `Betreibende Partei: ${claim.claimant_name}\n` +
      `Verpflichtete Partei: ${claim.debtor_name}${claim.debtor_address ? `, ${claim.debtor_address}` : ""}\n` +
      `Titel: ${titel}\n\n` +
      `Exekutionsmittel: ${mittelLabel} — Objekt: ${measure.target}\n\n` +
      `FORDERUNG: ${fmtEur(open)} € aushaftend von ${fmtEur(claim.total_claim)} € ` +
      `zuzüglich ${claim.interest_rate} % Zinsen p.a. ab ${claim.interest_from} ` +
      `und den Kosten der Exekution.`;
    return {
      art: "exekution",
      jurisdiction,
      gericht,
      antragsteller: { name: claim.claimant_name, rolle: "Betreibende Partei" },
      gegner: { name: claim.debtor_name, adresse: claim.debtor_address },
      forderung: {
        hauptforderung: claim.principal_amount,
        zinsen: claim.interest_amount,
        zinsen_prozent: claim.interest_rate,
        zinsen_laufend_ab: claim.interest_from,
        kosten: claim.costs_amount + measure.costs,
        gesamt: claim.total_claim,
        offen: open,
      },
      rechtsgrundlage: "§§ 3 ff. EO (Exekutionsantrag)",
      hinweise,
      antragstext,
    };
  }

  const hinweise = [
    "Voraussetzung: Vollstreckungsbescheid oder vollstreckbares Urteil mit Klausel (§ 724 ZPO).",
    "Konto-/Lohnpfändung: zuständiges Vollstreckungsgericht = Schuldner-Wohnsitz (§ 828 ZPO).",
    "Sachpfändung über Gerichtsvollzieher (§ 758 ZPO).",
    "Vollstreckungskosten als Nebenforderung geltend machen.",
  ];
  const antragstext =
    `ANTRAG AUF ZWANGSVOLLSTRECKUNG (§§ 750 ff. ZPO)\n\n` +
    `Vollstreckungsgericht: ${gericht}\n\n` +
    `Gläubiger:in: ${claim.claimant_name}\n` +
    `Schuldner:in: ${claim.debtor_name}${claim.debtor_address ? `, ${claim.debtor_address}` : ""}\n` +
    `Titel: ${titel}\n\n` +
    `Vollstreckungsmaßnahme: ${getZvTypeLabel(measure.type, jurisdiction)} — Gegenstand: ${measure.target}\n\n` +
    `FORDERUNG: ${fmtEur(open)} € zuzüglich Zinsen und Vollstreckungskosten.`;
  return {
    art: "exekution",
    jurisdiction,
    gericht,
    antragsteller: { name: claim.claimant_name, rolle: "Gläubiger:in" },
    gegner: { name: claim.debtor_name, adresse: claim.debtor_address },
    forderung: {
      hauptforderung: claim.principal_amount,
      zinsen: claim.interest_amount,
      zinsen_prozent: claim.interest_rate,
      zinsen_laufend_ab: claim.interest_from,
      kosten: claim.costs_amount + measure.costs,
      gesamt: claim.total_claim,
      offen: open,
    },
    rechtsgrundlage: "§§ 750 ff. ZPO (Zwangsvollstreckung)",
    hinweise,
    antragstext,
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

const STATUS_LABELS_DE: Record<Claim["status"], string> = {
  open: "Offen",
  mahnbescheid: "Mahnbescheid",
  vollstreckungsbescheid: "Vollstreckungsbescheid",
  zwangsvollstreckung: "Zwangsvollstreckung",
  paid: "Bezahlt",
  written_off: "Abgeschrieben",
};

const STATUS_LABELS_AT: Record<Claim["status"], string> = {
  open: "Offen",
  mahnbescheid: "Mahnklage",
  vollstreckungsbescheid: "Zahlungsbefehl rechtskräftig",
  zwangsvollstreckung: "Exekution",
  paid: "Bezahlt",
  written_off: "Abgeschrieben",
};

export function getClaimStatusLabel(
  status: Claim["status"],
  jurisdiction: ClaimJurisdiction = "de"
): string {
  const labels = jurisdiction === "at" ? STATUS_LABELS_AT : STATUS_LABELS_DE;
  return labels[status] ?? status;
}

const ZV_TYPE_LABELS_DE: Record<ZvMeasure["type"], string> = {
  pfändung_und_überweisung: "Pfändungs- und Überweisungsbeschluss",
  pfändung_immobilien: "Immobilienpfändung",
  pfändung_forderungen: "Forderungspfändung",
  zwangsversteigerung: "Zwangsversteigerung",
  zwangsverwaltung: "Zwangsverwaltung",
  eidesstattliche_versicherung: "Eidesstattliche Versicherung",
};

/** EO-Terminologie (Österreich) für dieselben Maßnahmentypen. */
const ZV_TYPE_LABELS_AT: Record<ZvMeasure["type"], string> = {
  pfändung_und_überweisung: "Forderungsexekution (Gehalts-/Kontoexekution)",
  pfändung_immobilien: "Immobilienexekution",
  pfändung_forderungen: "Forderungsexekution",
  zwangsversteigerung: "Zwangsversteigerung",
  zwangsverwaltung: "Zwangsverwaltung",
  eidesstattliche_versicherung: "Vermögensverzeichnis (§§ 46 ff. EO)",
};

export function getZvTypeLabel(
  type: ZvMeasure["type"],
  jurisdiction: ClaimJurisdiction = "de"
): string {
  const labels = jurisdiction === "at" ? ZV_TYPE_LABELS_AT : ZV_TYPE_LABELS_DE;
  return labels[type] ?? type;
}
