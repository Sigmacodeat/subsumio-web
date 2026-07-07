/**
 * Typen für die Legal-Frontmatter-Strukturen, die Akten-, Fristen-,
 * Rechnungs- und Portal-Seiten aus Brain-Pages lesen. Eine Stelle für den
 * Datenvertrag statt `(page as any).frontmatter` in jeder Seite.
 */

import type { DeadlineStatus } from "@/lib/legal-deadlines";

export interface DeadlineEntry {
  id?: string;
  title?: string;
  description?: string;
  /** Canonical deadline date. The only date field — no legacy `date` fallback. */
  due_date: string;
  status?: DeadlineStatus;
  type?: string;
  source?: string;
  court?: string;
  location?: string;
  start_date?: string;
  rule_key?: string;
  law?: string;
  calculation_note?: string;
  reminder_sent_at?: string;
  /** Welche Eskalationsstufen (in Tagen vor Fälligkeit) bereits per Mail verschickt wurden. */
  reminder_stages_sent?: number[];
  review_status?: "unreviewed" | "reviewed" | "approved" | "rejected";
  reviewed_by?: string;
  reviewed_at?: string;
  created_at?: string;
  updated_at?: string;
  audit_log?: DeadlineAuditEntry[];
  /** B1: Vorfrist — internal control deadline N days before the main deadline. */
  vorfrist_date?: string;
  /** B1: Whether this is a Notfrist (statutory deadline) requiring Vier-Augen-Kontrolle. */
  is_notfrist?: boolean;
  /** B1: Vier-Augen-Prinzip — second checker must confirm before deadline can be marked done. */
  second_check_required?: boolean;
  second_check_by?: string;
  second_check_at?: string;
  /** B1: Vorfrist reminder tracking. */
  vorfrist_reminder_sent_at?: string;
  /** C3: ERV-Zustelldatum — Fristbeginn ab elektronischer Zustellung. */
  erv_zustelldatum?: string;
}

export interface DeadlineAuditEntry {
  at: string;
  action: "created" | "updated" | "reviewed" | "deleted" | "second_check" | "vorfrist_reached";
  actor?: string;
  note?: string;
}

export interface TimelineEntry {
  id?: string;
  date?: string;
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  actor?: string;
  timestamp?: string;
}

export interface TaskEntry {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  description: string;
  minutes: number;
  date: string;
  rate?: number;
  billable?: boolean;
  billed?: boolean;
  invoice_number?: string;
  lawyer?: string;
  activity_type?: string;
  started_at?: string;
  ended_at?: string;
  note?: string;
  /** P3-2: Approval status for time entries — null = no approval needed, "pending" = submitted for approval, "approved" = confirmed, "rejected" = declined */
  approval_status?: "pending" | "approved" | "rejected" | null;
}

export interface ExpenseEntry {
  id: string;
  description: string;
  date: string;
  amount: number;
  vat_rate?: number;
  billable?: boolean;
  billed?: boolean;
  invoice_number?: string;
  receipt_slug?: string;
}

export interface DocumentEntry {
  id: string;
  name: string;
  url?: string;
  uploadedAt: string;
  size?: number;
  slug?: string;
  source?: string;
  kind?: string;
  doc_type?: string;
  doc_type_label?: string;
  extraction_status?: string;
  extraction_error_code?: string;
  ocr_status?: string;
  extraction_method?: string;
  extraction_unverified?: boolean;
  analysis_status?:
    | "completed"
    | "failed"
    | "retrying"
    | "permanently_failed"
    | "processing"
    | "pending";
  analysis_error?: string;
  analysis_retry_count?: number;
  privileged?: boolean;
  privilege_type?: string;
}

export interface EvidenceEntry {
  title?: string;
  description?: string;
  type?: string;
  strength?: string;
  source?: string;
  /** 0..1 — Beweisgewicht aus der Beweislage-Analyse. */
  weight?: number;
}

export interface StrategyRisk {
  description?: string;
  probability?: string;
  impact?: string;
}

export interface StrategyInfo {
  summary?: string;
  recommendation?: string;
  /** Kurzform der empfohlenen Strategie (Akten-Detail "Empfohlene Strategie"). */
  recommended?: string;
  recommendedApproach?: string;
  generatedAt?: string;
  risks?: StrategyRisk[];
}

export interface CommunicationEntry {
  id: string;
  channel: "email" | "whatsapp" | "phone" | "letter" | "portal" | "bea" | "other";
  direction: "incoming" | "outgoing";
  subject?: string;
  summary?: string;
  timestamp: string;
  counterpart?: string;
  counterpart_slug?: string;
  lawyer?: string;
  privileged?: boolean;
  attachment_slugs?: string[];
}

export interface PermissionInfo {
  /** User-IDs oder Rollen mit Zugriff auf diese Akte. */
  allowed_users?: string[];
  /** User-IDs oder Rollen, die von dieser Akte ausgeschlossen sind (Ethical Wall). */
  blocked_users?: string[];
  /** Ob die Akte als vertraulich markiert ist (Privilege). */
  privileged?: boolean;
  /** Ob ein Legal Hold aktiv ist. */
  legal_hold?: boolean;
  /** Sichtbarkeitseinschränkung: 'full' = alle im Team, 'restricted' = nur allowed_users, 'confidential' = nur Owner. */
  visibility?: "full" | "restricted" | "confidential";
}

/** Phase A: Zusätzlicher Gegner für mehrgleisige Fälle (Amtshaftung mit mehreren Verantwortlichen). */
export interface AdditionalOpponent {
  /** Anzeigename des Gegners. */
  name: string;
  /** Slug des verknüpften Kontakts (role=opponent), optional. */
  slug?: string;
  /** Rolle des Gegners im Verfahren. */
  rolle:
    | "hauptbeklagter"
    | "nebenbeklagter"
    | "drittbeteiligter"
    | "datenverantwortlicher"
    | "beamter"
    | "privatperson";
  /** Welche Verfahrensschiene betrifft dieser Gegner? (z.B. "zivil", "dsgvo", "straf", "disziplinar") */
  verfahrensschiene?:
    | "zivil"
    | "dsgvo"
    | "straf"
    | "disziplinar"
    | "verwaltungsrecht"
    | "finanzstraf"
    | "sonstiges";
  /** Kurze Beschreibung des Haftungsgrunds gegenüber diesem Gegner. */
  haftungsgrund?: string;
}

export interface CaseFrontmatter {
  type?: string;
  case_number?: string;
  status?: string;
  legal_area?: string;
  sub_area?: string;
  jurisdiction?: "de" | "at" | "ch" | "eu";
  priority?: string;
  client_id?: string;
  client_name?: string;
  /** Slug des verknüpften Kontakts (role=client). Bevorzugt gegenüber client_name. */
  client_slug?: string;
  opponent_id?: string;
  opponent_name?: string;
  /** Slugs der verknüpften Gegner (role=opponent). */
  opponent_slugs?: string[];
  /** Phase A: Zusätzliche Gegner für mehrgleisige Fälle (mehrere Beklagte unterschiedlicher Rolle). */
  additional_opponents?: AdditionalOpponent[];
  /** Phase B: Verknüpfte Akten desselben Mandats (mehrere Gerichtsakten unter einem Mandat). */
  related_case_slugs?: string[];
  /** Phase B: Mandats-ID — gemeinsamer Schlüssel für mehrere Akten. Wenn gesetzt, können Akten darüber gefunden werden. */
  mandate_id?: string;
  conflict_status?: "conflict_pending" | "conflict_clear" | "conflict_waived" | string;
  conflict_waiver_reason?: string;
  conflict_waived_at?: string;
  own_lawyer_id?: string;
  own_lawyer_name?: string;
  /** Slug des verknüpften Bearbeiter-/Anwaltskontakts (role=lawyer). */
  own_lawyer_slug?: string;
  court_id?: string;
  court_name?: string;
  /** Slug des verknüpften Gerichts (role=court). */
  court_slug?: string;
  claims?: string[];
  defenses?: string[];
  evidence?: EvidenceEntry[];
  strategy?: StrategyInfo;
  outcome?: Record<string, unknown>;
  estimated_value?: { min: number; max: number; currency: string };
  tags?: string[];
  deadlines?: DeadlineEntry[];
  /** P0-2: KI-extrahierte Fristenvorschläge aus Dokumentanalyse (await confirmation) */
  suggested_deadlines?: Array<{
    title: string;
    due_date: string;
    urgency: string;
    source: string;
    source_quote: string;
    confirmed: boolean;
  }>;
  /** P0-2: KI-extrahierte Parteienvorschläge aus Dokumentanalyse */
  suggested_parties?: Array<{
    name: string;
    role: string;
    source: string;
    confirmed: boolean;
  }>;
  timeline?: TimelineEntry[];
  timeline_events?: TimelineEntry[];
  tasks?: TaskEntry[];
  time_entries?: TimeEntry[];
  expenses?: ExpenseEntry[];
  documents?: DocumentEntry[];
  portal_enabled?: boolean;
  portal_note?: string;
  communications?: CommunicationEntry[];
  permissions?: PermissionInfo;
  audit_log?: AuditLogEntry[];
  /** Soft-delete: timestamp when case was archived */
  archived_at?: string;
  /** Soft-delete: user who archived the case */
  archived_by?: string;
  /** Restore: timestamp when case was restored from archive */
  restored_at?: string;
  /** Optimistic locking version — incremented on every update */
  version?: number;
  /** P1: Cross-document contradictions detected by /api/legal/contradictions */
  contradictions?: Array<{
    doc_a_slug: string;
    doc_b_slug: string;
    field: string;
    value_a: string;
    value_b: string;
    severity: "high" | "medium" | "low";
    description: string;
  }>;
  contradictions_checked_at?: string;
  contradiction_count?: number;
  /** RCIID Krypto-Forensik Integration — Wallet-Adressen und Untersuchungsstatus */
  crypto_forensics?: {
    rciid_case_id?: string;
    status?:
      | "none"
      | "submitted"
      | "received"
      | "investigating"
      | "tracing"
      | "analyzing"
      | "reporting"
      | "completed"
      | "rejected";
    wallets?: Array<{
      address: string;
      blockchain: string;
      label?: string;
      detected_at?: string;
      detected_by?: "ai" | "manual";
      source_document?: string;
    }>;
    submitted_at?: string;
    completed_at?: string;
    report_slug?: string;
    billing_expense_id?: string;
    pricing?: { amount: number; currency: string; type: "flat" | "hourly" };
    progress_percent?: number;
    current_phase?: string;
    timeline?: Array<{
      phase: string;
      timestamp: string;
      description: string;
    }>;
  };
}

export interface InvoiceExpenseEntry {
  description: string;
  date: string;
  amount: number;
}

export interface InvoiceFrontmatter {
  type?: string;
  invoice_number?: string;
  client?: string;
  client_slug?: string;
  client_address?: string;
  case_number?: string;
  date?: string;
  due_date?: string;
  items?: Array<{ description: string; date: string; hours: number; rate: number; amount: number }>;
  expenses?: InvoiceExpenseEntry[];
  status?: string;
  subtotal?: number;
  expense_total?: number;
  advance_payment?: number;
  paid_amount?: number;
  paid_at?: string;
  vat_rate?: number;
  tax?: number;
  total?: number;
  payment_terms?: string;
  bank?: {
    name?: string;
    iban?: string;
    bic?: string;
  };
  notes?: string;
  // Mahnwesen
  reminder_count?: number;
  reminder_sent_at?: string[];
  reminder_fee?: number;
  // Erweiterte Rechnungslegung
  invoice_type?: "standard" | "teilrechnung" | "sammelrechnung" | "gutschrift";
  parent_invoice_id?: string;
  case_slugs?: string[];
  // E-Rechnung
  leitweg_id?: string;
}

export interface ContactFrontmatter {
  type?: string;
  role?: "client" | "opponent" | "court" | "lawyer" | "other";
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  tags?: string[];
  leitwegId?: string;
}

export interface NormFrontmatter {
  type?: string;
  code?: string;
  section?: string;
  paragraph?: string;
  jurisdiction?: string;
}

export interface DecisionFrontmatter {
  type?: string;
  court?: string;
  date?: string;
  ecli?: string;
  case_number?: string;
  legal_area?: string;
  keywords?: string[];
  source_url?: string;
  jurisdiction?: string;
  outcome?: string;
}

export interface AuditLogEntry {
  id: string;
  at: string;
  action:
    | "created"
    | "updated"
    | "deleted"
    | "status_changed"
    | "time_added"
    | "deadline_added"
    | "reminder_sent";
  actor?: string;
  actorId?: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  note?: string;
}

/** Frontmatter eines beliebigen Objekts typisiert lesen (fehlend → {}). */
export function frontmatterOf<T>(page: unknown): T {
  const fm = (page as { frontmatter?: Record<string, unknown> } | null | undefined)?.frontmatter;
  return (fm && typeof fm === "object" ? fm : {}) as T;
}

/** Frontmatter einer Page als CaseFrontmatter lesen (fehlend → {}). */
export function caseFrontmatter(page: { frontmatter?: Record<string, unknown> }): CaseFrontmatter {
  return (page.frontmatter ?? {}) as CaseFrontmatter;
}

/** Frontmatter einer Page als InvoiceFrontmatter lesen (fehlend → {}). */
export function invoiceFrontmatter(page: {
  frontmatter?: Record<string, unknown>;
}): InvoiceFrontmatter {
  return (page.frontmatter ?? {}) as InvoiceFrontmatter;
}

/**
 * Canonical deadline date accessor.
 * Returns `due_date` if present, falls back to `date` for raw frontmatter backward compat.
 * Use this when reading from untyped frontmatter; typed DeadlineEntry always has due_date.
 */
export function canonicalDeadlineDate(entry: {
  due_date?: string;
  date?: string;
}): string | undefined {
  return entry.due_date ?? entry.date;
}
