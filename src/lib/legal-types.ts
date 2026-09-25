import type { MatterGrant } from "@/lib/matter-access";
/**
 * Typen für die Legal-Frontmatter-Strukturen, die Akten-, Fristen-,
 * Rechnungs- und Portal-Seiten aus Brain-Pages lesen. Eine Stelle für den
 * Datenvertrag statt `(page as any).frontmatter` in jeder Seite.
 */

import type { DeadlineStatus } from "@/lib/legal-deadlines";
import type { CaseMandateAcceptance } from "@/lib/intake-acceptance";

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
  /** ISO date (YYYY-MM-DD). Was already read by dashboard/tasks/page.tsx
   * but never written anywhere — no task had a due date to read. */
  dueDate?: string;
  /** Zuweisung/Delegation: who is responsible for this task. */
  assigneeId?: string;
  assigneeName?: string;
  /** WP-7.42: "agent" = die Aufgabe wird vom KI-Agenten mit Aktenkontext
   * bearbeitet (cron/agent-tasks); Ergebnis braucht anwaltliche Prüfung. */
  assigneeType?: "user" | "agent";
  agentStatus?: "pending" | "needs_review";
  /** Vom Agenten erzeugtes Zwischenergebnis — nie als Endfassung zeigen. */
  agentResult?: string;
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
  /** ISO-4217-Währungscode (Default "EUR" — gesetzt ab /api/expenses). */
  currency?: string;
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
  /**
   * Released to the client portal. Default (undefined/false): NOT visible —
   * internal memos, strategy drafts and expert opinions must never reach the
   * Mandant by accident. Portal uploads are visible to the uploading client.
   */
  portal_visible?: boolean;
  size?: number;
  slug?: string;
  /** Media type of the stored original, e.g. application/pdf. */
  mime_type?: string;
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
  /** Documents of the matter the strategy was based on. */
  documentsConsidered?: number;
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
  /** 'full' = ganze Kanzlei nach Rolle, 'restricted' = Aktenteam, Freigaben und Admins, 'confidential' = nur Aktenteam und Freigaben (siehe matter-access.ts). */
  visibility?: "full" | "restricted" | "confidential";
  /** Befristbare Einzelfreigaben (Lesen/Schreiben) für Kolleg:innen. */
  grants?: MatterGrant[];
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
  /** Mandatsannahme-Pipeline — Pflichtnachweise aus der Intake-Konvertierung oder Quick-Create. */
  mandate_acceptance?: CaseMandateAcceptance;
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
  /** Streitwert in Euro — Grundlage für RATG/AHK-Honorarberechnung. Added in cases/new/page.tsx (Welle B, 21.09.2026); was missing from the type. */
  dispute_value?: number;
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
  knowledge_reviews?: Array<{
    fact_id: string;
    status: "approved" | "party_assertion" | "corrected" | "rejected";
    original_statement: string;
    corrected_statement?: string;
    source: string;
    reviewed_at: string;
  }>;
  timeline?: TimelineEntry[];
  timeline_events?: TimelineEntry[];
  tasks?: TaskEntry[];
  time_entries?: TimeEntry[];
  expenses?: ExpenseEntry[];
  documents?: DocumentEntry[];
  portal_enabled?: boolean;
  portal_note?: string;
  /**
   * Registry of issued portal links (hash-only, src/lib/portal-links.ts).
   * Raw tokens are never stored.
   */
  portal_links?: Array<{
    token_hash: string;
    created_at: string;
    expires_at?: string;
    purpose?: string;
    revoked_at?: string;
  }>;
  /**
   * "Alle Links widerrufen" sets this ISO cutoff — portal tokens issued
   * before it are dead even if their hash never reached the registry.
   * Enforced in src/lib/portal-access.ts.
   */
  portal_links_reset_at?: string;
  /**
   * WP-7.40: Workflow-Template-IDs (src/lib/workflow.ts), die Mandanten
   * im Portal selbst ausführen dürfen. Prompts bleiben serverseitig.
   */
  portal_workflows?: string[];
  /**
   * Monitoring-Alerts, die der Anwalt ins Mandantenportal freigegeben hat
   * (api/monitoring/publish-alert). Nur geprüfte Kurzfassungen — nie der
   * interne Rohtext.
   */
  client_alerts?: Array<{
    id: string;
    title: string;
    summary?: string;
    url?: string;
    date?: string;
    severity?: string;
    impact_note?: string;
    published_at?: string;
  }>;
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
  /** Verjährung — statute of limitations tracking per claim */
  statute_of_limitations?: StatuteOfLimitations[];
}

export interface StatuteOfLimitations {
  id: string;
  claim_label: string;
  claim_type: string;
  law: string;
  /** When the limitation period starts (Kenntniserlangung / Entstehung) */
  start_date: string;
  /** Regular limitation period in years (e.g., 3 for § 195 BGB) */
  period_years: number;
  /** Absolute maximum period in years (e.g., 10 for § 199 Abs. 3 BGB) */
  max_period_years?: number;
  /** Calculated end date of the regular limitation period */
  regular_barred_date: string;
  /** Calculated absolute end date (max_period_years from start_date) */
  absolute_barred_date?: string;
  /** Effective barred date considering interruptions — computed, not manually set */
  effective_barred_date?: string;
  status: "active" | "barred" | "interrupted" | "suspended";
  /** Hemmung der Verjährung — interrupts the running period */
  interruptions?: VerjaehrungInterruption[];
  /** Ruhen der Verjährung — suspends the running period */
  suspensions?: VerjaehrungSuspension[];
  /** Whether a new deadline page should be auto-created for this limitation */
  deadline_slug?: string;
  created_at: string;
  updated_at: string;
}

export interface VerjaehrungInterruption {
  at: string;
  reason: string;
  /** e.g., "Anerkenntnis", "Klageerhebung", "Mahnung", "Verhandlungen" */
  kind: "acknowledgment" | "lawsuit" | "dunning" | "negotiation" | "other";
  actor?: string;
  note?: string;
}

export interface VerjaehrungSuspension {
  start: string;
  end?: string;
  reason: string;
  actor?: string;
  note?: string;
}

export interface InvoiceExpenseEntry {
  description: string;
  date: string;
  amount: number;
  /**
   * Steuersatz der Auslage als Anteil (0 = durchlaufender Posten, z. B. im
   * Namen des Mandanten entrichtete Gerichtsgebühr). Fehlt er, gilt der Satz
   * der Rechnung.
   */
  vat_rate?: number;
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
  invoice_type?: "standard" | "teilrechnung" | "sammelrechnung" | "gutschrift" | "storno";
  parent_invoice_id?: string;
  /** Storno-Note: Nummer und Datum der stornierten Rechnung. */
  parent_invoice_number?: string;
  parent_invoice_date?: string;
  /** USt je Steuersatz (Anteil), serverseitig nachgerechnet. */
  tax_breakdown?: Array<{ rate: number; net: number; tax: number }>;
  /** Übergang der Steuerschuld (§ 19 Abs 1 UStG 1994) — keine USt, Pflichthinweis. */
  reverse_charge?: boolean;
  /** UID des Leistungsempfängers (Pflicht bei Reverse Charge). */
  client_vat_id?: string;
  case_slugs?: string[];
  // E-Rechnung
  leitweg_id?: string;
  /** Transport-Kanal der letzten e-Rechnung-Übertragung. */
  e_invoice_channel?: "peppol" | "erechnung_gv_at";
  /** Übertragungs-Referenz des Access Points (für Status-Poll). */
  e_invoice_reference?: string;
  e_invoice_status?: "queued" | "delivered" | "failed";
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
  /** UID-Nummer (Unternehmer-Mandant). */
  vat_id?: string;
  /** Unternehmer im EU-Ausland: Rechnungen mit Übergang der Steuerschuld. */
  reverse_charge?: boolean;
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
    | "reminder_sent"
    | "knowledge_add"
    | "knowledge_approve"
    | "knowledge_mark_party_assertion"
    | "knowledge_correct"
    | "knowledge_reject"
    | "knowledge_supersede";
  actor?: string;
  actorId?: string;
  actorType?: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  note?: string;
  source?: unknown;
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
