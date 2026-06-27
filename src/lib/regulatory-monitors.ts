/**
 * Regulatory Monitoring — shared types and helpers.
 *
 * Monitor definitions and alerts are stored as Brain-Pages:
 *   - type: "regulatory_monitor"  → a monitor definition (topic, jurisdiction, …)
 *   - type: "regulatory_alert"     → a triggered alert from a monitor run
 *
 * Used by:
 *   - /dashboard/monitoring (CRUD UI + alert feed)
 *   - /api/cron/regulatory-monitors (scheduled execution)
 *   - /api/cron/case-law (backward-compatible integration)
 */

import type { BrainPage } from "./types";

// ── Monitor Definition ─────────────────────────────────────────────

export type Jurisdiction = "at" | "de" | "ch" | "all" | "eu";
export type MonitorFrequency = "daily" | "weekly" | "monthly";
export type MonitorStatus = "active" | "paused";
export type MonitorSource = "case-law" | "legislation" | "regulations" | "case-scanner";
export type ChangeType =
  | "new_judgement"
  | "new_regulation"
  | "amendment"
  | "repeal"
  | "case_update";
export type Severity = "high" | "medium" | "low";

export interface RegulatoryMonitor {
  monitor_id: string;
  topic: string;
  description?: string;
  jurisdiction: Jurisdiction;
  frequency: MonitorFrequency;
  sources: MonitorSource[];
  keywords: string[];
  status: MonitorStatus;
  email_notifications: boolean;
  notify_emails?: string[];
  severity_filter?: Severity;
  created_at: string;
  updated_at: string;
  last_run_at?: string;
  last_run_status?: "ok" | "error";
  last_run_hits?: number;
}

export interface RegulatoryAlert {
  monitor_id: string;
  monitor_topic: string;
  change_type: ChangeType;
  severity: Severity;
  source: string;
  date: string;
  title: string;
  summary?: string;
  url?: string;
  court?: string;
  case_number?: string;
  ecli?: string;
  keywords?: string[];
  read: boolean;
  created_at: string;
}

// ── Slug helpers ───────────────────────────────────────────────────

const MONITOR_PREFIX = "monitoring/monitors/";
const ALERT_PREFIX = "monitoring/alerts/";
const LEGACY_WATCHLIST_SLUG = "monitoring/case-law-watchlist";

export function monitorSlug(id: string): string {
  return `${MONITOR_PREFIX}${id}`;
}

export function alertSlug(monitorId: string, hitId: string): string {
  const ts = Date.now();
  const safeHit = hitId.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 60);
  return `${ALERT_PREFIX}${monitorId}/${ts}-${safeHit}`;
}

export function monitorIdFromSlug(slug: string): string {
  return slug.startsWith(MONITOR_PREFIX) ? slug.slice(MONITOR_PREFIX.length) : slug;
}

export function isMonitorSlug(slug: string): boolean {
  return slug.startsWith(MONITOR_PREFIX);
}

export function isAlertSlug(slug: string): boolean {
  return slug.startsWith(ALERT_PREFIX);
}

// ── Frontmatter ↔ Monitor conversion ───────────────────────────────

export function frontmatterToMonitor(page: BrainPage): RegulatoryMonitor | null {
  const fm = page.frontmatter ?? {};
  if (page.type !== "regulatory_monitor" && fm.type !== "regulatory_monitor") return null;
  const id = String(fm.monitor_id ?? monitorIdFromSlug(page.slug));
  return {
    monitor_id: id,
    topic: String(fm.topic ?? page.title ?? ""),
    description: fm.description ? String(fm.description) : undefined,
    jurisdiction: (["at", "de", "ch", "all", "eu"].includes(String(fm.jurisdiction))
      ? String(fm.jurisdiction)
      : "all") as Jurisdiction,
    frequency: (["daily", "weekly", "monthly"].includes(String(fm.frequency))
      ? String(fm.frequency)
      : "daily") as MonitorFrequency,
    sources: Array.isArray(fm.sources)
      ? fm.sources.filter((s): s is MonitorSource =>
          ["case-law", "legislation", "regulations", "case-scanner"].includes(String(s))
        )
      : ["case-law"],
    keywords: Array.isArray(fm.keywords) ? fm.keywords.map(String).filter(Boolean) : [],
    status: (["active", "paused"].includes(String(fm.status))
      ? String(fm.status)
      : "active") as MonitorStatus,
    email_notifications: fm.email_notifications !== false,
    notify_emails: Array.isArray(fm.notify_emails) ? fm.notify_emails.map(String) : undefined,
    severity_filter: fm.severity_filter as Severity | undefined,
    created_at: String(fm.created_at ?? page.created_at ?? new Date().toISOString()),
    updated_at: String(fm.updated_at ?? page.updated_at ?? new Date().toISOString()),
    last_run_at: fm.last_run_at ? String(fm.last_run_at) : undefined,
    last_run_status: fm.last_run_status as "ok" | "error" | undefined,
    last_run_hits: typeof fm.last_run_hits === "number" ? fm.last_run_hits : undefined,
  };
}

export function monitorToFrontmatter(m: Partial<RegulatoryMonitor>): Record<string, unknown> {
  return {
    type: "regulatory_monitor",
    monitor_id: m.monitor_id,
    topic: m.topic,
    description: m.description,
    jurisdiction: m.jurisdiction,
    frequency: m.frequency,
    sources: m.sources,
    keywords: m.keywords,
    status: m.status,
    email_notifications: m.email_notifications,
    notify_emails: m.notify_emails,
    severity_filter: m.severity_filter,
    created_at: m.created_at,
    updated_at: m.updated_at,
    last_run_at: m.last_run_at,
    last_run_status: m.last_run_status,
    last_run_hits: m.last_run_hits,
  };
}

// ── Frontmatter ↔ Alert conversion ─────────────────────────────────

export function frontmatterToAlert(page: BrainPage): RegulatoryAlert | null {
  const fm = page.frontmatter ?? {};
  if (page.type !== "regulatory_alert" && fm.type !== "regulatory_alert") return null;
  return {
    monitor_id: String(fm.monitor_id ?? ""),
    monitor_topic: String(fm.monitor_topic ?? ""),
    change_type: ([
      "new_judgement",
      "new_regulation",
      "amendment",
      "repeal",
      "case_update",
    ].includes(String(fm.change_type))
      ? String(fm.change_type)
      : "new_judgement") as ChangeType,
    severity: (["high", "medium", "low"].includes(String(fm.severity))
      ? String(fm.severity)
      : "medium") as Severity,
    source: String(fm.source ?? ""),
    date: String(fm.date ?? ""),
    title: String(fm.title ?? page.title ?? ""),
    summary: fm.summary ? String(fm.summary) : undefined,
    url: fm.url ? String(fm.url) : undefined,
    court: fm.court ? String(fm.court) : undefined,
    case_number: fm.case_number ? String(fm.case_number) : undefined,
    ecli: fm.ecli ? String(fm.ecli) : undefined,
    keywords: Array.isArray(fm.keywords) ? fm.keywords.map(String) : undefined,
    read: fm.read === true,
    created_at: String(fm.created_at ?? page.created_at ?? new Date().toISOString()),
  };
}

export function alertToFrontmatter(a: Partial<RegulatoryAlert>): Record<string, unknown> {
  return {
    type: "regulatory_alert",
    monitor_id: a.monitor_id,
    monitor_topic: a.monitor_topic,
    change_type: a.change_type,
    severity: a.severity,
    source: a.source,
    date: a.date,
    title: a.title,
    summary: a.summary,
    url: a.url,
    court: a.court,
    case_number: a.case_number,
    ecli: a.ecli,
    keywords: a.keywords,
    read: a.read,
    created_at: a.created_at,
  };
}

// ── Legacy watchlist migration ─────────────────────────────────────

export interface LegacyWatchTerm {
  query: string;
  jurisdiction: "at" | "de" | "ch" | "all";
}

export const LEGACY_WATCHLIST = LEGACY_WATCHLIST_SLUG;

export function isLegacyWatchlist(page: BrainPage): boolean {
  return page.slug === LEGACY_WATCHLIST_SLUG || page.type === "monitoring";
}

// ── Frequency check ────────────────────────────────────────────────

export function shouldRunToday(frequency: MonitorFrequency, now = new Date()): boolean {
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  const date = now.getUTCDate();
  if (frequency === "daily") return true;
  if (frequency === "weekly") return day === 1; // Monday
  if (frequency === "monthly") return date === 1;
  return false;
}

// ── Severity inference ─────────────────────────────────────────────

export function inferSeverity(hit: {
  legalArea?: string;
  keywords?: string[];
  snippet?: string;
}): Severity {
  const text =
    `${hit.legalArea ?? ""} ${hit.keywords?.join(" ") ?? ""} ${hit.snippet ?? ""}`.toLowerCase();
  if (/(grundgesetz|verfassung|bverfg|eugh|eu-?verordnung|dsgvo|gdpr)/.test(text)) return "high";
  if (/(bgh|bfh|bverwg|bsg|bag|olg|ovg|\bsg\b|lag)/.test(text)) return "medium";
  return "low";
}

// ── Change type inference ──────────────────────────────────────────

export function inferChangeType(hit: { type?: string; snippet?: string }): ChangeType {
  const text = `${hit.type ?? ""} ${hit.snippet ?? ""}`.toLowerCase();
  if (/(änderung|novelle|reform|amendment)/.test(text)) return "amendment";
  if (/(aufhebung|repeal|gestrichen)/.test(text)) return "repeal";
  if (/(verordnung|regulation|durchführungs)/.test(text)) return "new_regulation";
  return "new_judgement";
}

// ── ID generation ──────────────────────────────────────────────────

export function generateMonitorId(topic: string): string {
  const slug = topic
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug || "monitor"}-${rand}`;
}

// ── Display helpers ────────────────────────────────────────────────

export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  at: "Österreich",
  de: "Deutschland",
  ch: "Schweiz",
  all: "DE + AT + CH",
  eu: "EU",
};

export const FREQUENCY_LABELS: Record<MonitorFrequency, string> = {
  daily: "Täglich",
  weekly: "Wöchentlich",
  monthly: "Monatlich",
};

export const SOURCE_LABELS: Record<MonitorSource, string> = {
  "case-law": "Rechtsprechung",
  legislation: "Gesetzgebung",
  regulations: "Verordnungen",
  "case-scanner": "Akten-Scanner",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  high: "text-red-600 bg-red-500/10 border-red-500/20",
  medium: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  low: "text-blue-600 bg-blue-500/10 border-blue-500/20",
};

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  new_judgement: "Neue Entscheidung",
  new_regulation: "Neue Verordnung",
  amendment: "Änderung",
  repeal: "Aufhebung",
  case_update: "Akten-Update",
};
