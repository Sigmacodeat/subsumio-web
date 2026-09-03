/**
 * RCIID API Client — Krypto-Forensik Integration.
 *
 * Verbindet Subsumio mit der rciid.at Forensik-Plattform.
 * Anwälte können Krypto-Wallet-Adressen übermitteln, den Untersuchungsfortschritt
 * verfolgen und Berichte zurückerhalten.
 *
 * Pattern: wie src/lib/docusign.ts (API-Key Auth, withRetry, externalFetchTimeout)
 *
 * Features:
 *   - API-Key basierte Authentifizierung
 *   - HMAC-SHA256 Webhook-Signatur-Verifikation
 *   - Idempotency-Tracking für Webhook-Dedup
 *   - Retry mit exponentiellem Backoff
 *   - Timeout-Schutz für externe Calls
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { withRetry, externalFetchTimeout } from "@/lib/retry";
import { AppError } from "@/lib/errors";
import { createIdempotencyStore } from "@/lib/idempotency";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const log = logger("rciid");

const API_URL = env("RCIID_API_URL") || "https://rciid.at/api/v1";
const API_KEY = env("RCIID_API_KEY") || "";

// ── Types ───────────────────────────────────────────────────────────────────

export type RciidCaseStatus =
  | "none"
  | "submitted"
  | "received"
  | "investigating"
  | "tracing"
  | "analyzing"
  | "reporting"
  | "completed"
  | "rejected";

export type BlockchainType = "BTC" | "ETH" | "USDT" | "SOL" | "LTC" | "XRP" | "TRX" | "UNKNOWN";

export interface RciidWalletSubmission {
  address: string;
  blockchain: BlockchainType;
  label?: string;
  notes?: string;
}

export interface RciidCaseSubmission {
  external_case_id: string;
  client_reference?: string;
  lawyer_reference?: string;
  jurisdiction?: "DE" | "AT" | "CH" | "EU";
  case_type?: string;
  wallets: RciidWalletSubmission[];
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  webhook_url?: string;
  metadata?: Record<string, unknown>;
}

// ── Structured Case Context (Rich JSON Payload) ──────────────────────────────

export interface RciidTimelineEntry {
  date: string;
  event: string;
}

export interface RciidCaseContext {
  summary: string;
  timeline: RciidTimelineEntry[];
}

export interface RciidTargetAddress {
  address: string;
  label?: string;
  amount_btc?: number;
}

export interface RciidVictimDeposit {
  address: string;
  amount_btc: number;
  date: string;
  txid?: string;
}

export interface RciidKnownRecipient {
  address: string;
  label: string;
  source?: string;
}

export interface RciidExchangeLink {
  address: string;
  exchange: string;
  account_hint?: string;
}

export interface RciidEvidenceRef {
  type: string;
  description: string;
  extracted_addresses?: string[];
}

export interface RciidCaseContextSubmission extends RciidCaseSubmission {
  case_context?: RciidCaseContext;
  target_addresses?: RciidTargetAddress[];
  victim_deposits?: RciidVictimDeposit[];
  known_recipients?: RciidKnownRecipient[];
  exchange_links?: RciidExchangeLink[];
  evidence_refs?: RciidEvidenceRef[];
}

export interface RciidPricing {
  amount: number;
  currency: string;
  type: "flat" | "hourly";
}

export interface RciidCase {
  case_id: string;
  status: RciidCaseStatus;
  estimated_completion_days?: number;
  pricing?: RciidPricing;
  webhook_registered?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RciidTimelineEvent {
  phase: string;
  timestamp: string;
  description: string;
  details?: Record<string, unknown>;
}

export interface RciidCaseStatusResponse {
  case_id: string;
  status: RciidCaseStatus;
  progress_percent: number;
  current_phase: string;
  estimated_completion_days?: number;
  pricing?: RciidPricing;
  timeline?: RciidTimelineEvent[];
  updated_at?: string;
  data_quality?: RciidQualityFeedback;
}

// ── Data Quality Score + Feedback ────────────────────────────────────────────

export type RciidDataQualityScore = 1 | 2 | 3 | 4 | 5;

export interface RciidQualityFeedback {
  score: RciidDataQualityScore;
  missing_data: string[];
  suggestions: string[];
  automatable_percentage: number;
}

export interface RciidReport {
  case_id: string;
  status: RciidCaseStatus;
  report_url?: string;
  pdf_base64?: string;
  json_data?: Record<string, unknown>;
  summary?: string;
  findings?: Array<{
    title: string;
    description: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    evidence?: string[];
  }>;
  generated_at?: string;
}

export interface RciidWebhookEvent {
  event_id: string;
  case_id: string;
  event_type:
    | "status_changed"
    | "phase_completed"
    | "report_ready"
    | "case_rejected"
    | "quality_feedback";
  status: RciidCaseStatus;
  progress_percent?: number;
  current_phase?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// ── Status Helpers ──────────────────────────────────────────────────────────

export const RCIID_STATUS_ORDER: RciidCaseStatus[] = [
  "none",
  "submitted",
  "received",
  "investigating",
  "tracing",
  "analyzing",
  "reporting",
  "completed",
];

export const RCIID_STATUS_LABELS_DE: Record<RciidCaseStatus, string> = {
  none: "Nicht übermittelt",
  submitted: "Übermittelt",
  received: "Empfangen",
  investigating: "In Untersuchung",
  tracing: "Wallet-Verfolgung",
  analyzing: "Analyse",
  reporting: "Berichtserstellung",
  completed: "Abgeschlossen",
  rejected: "Abgelehnt",
};

export const RCIID_STATUS_LABELS_EN: Record<RciidCaseStatus, string> = {
  none: "Not submitted",
  submitted: "Submitted",
  received: "Received",
  investigating: "Investigating",
  tracing: "Tracing",
  analyzing: "Analyzing",
  reporting: "Reporting",
  completed: "Completed",
  rejected: "Rejected",
};

export const RCIID_STATUS_COLORS: Record<RciidCaseStatus, string> = {
  none: "#6a6a8a",
  submitted: "#6366f1",
  received: "#6366f1",
  investigating: "#f59e0b",
  tracing: "#f59e0b",
  analyzing: "#f59e0b",
  reporting: "#8b5cf6",
  completed: "#22c55e",
  rejected: "#ef4444",
};

export function getRciidStatusProgress(status: RciidCaseStatus): number {
  if (status === "rejected") return 0;
  const idx = RCIID_STATUS_ORDER.indexOf(status);
  if (idx < 0) return 0;
  return Math.round((idx / (RCIID_STATUS_ORDER.length - 1)) * 100);
}

export function isRciidCaseActive(status: RciidCaseStatus): boolean {
  return !["none", "completed", "rejected"].includes(status);
}

export function isRciidCaseDone(status: RciidCaseStatus): boolean {
  return status === "completed" || status === "rejected";
}

// ── Configuration ───────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return Boolean(API_KEY && API_URL);
}

export function getApiUrl(): string {
  return API_URL;
}

// ── API Operations ──────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

export class RciidError extends AppError {
  constructor(
    message: string,
    opts: { code: string; details?: Record<string, unknown>; cause?: Error }
  ) {
    super(message, { ...opts, statusCode: 502 });
  }
}

/**
 * Submit a new crypto forensics case to RCIID.
 */
export async function submitCase(input: RciidCaseSubmission): Promise<RciidCase> {
  if (!isConfigured()) {
    throw new RciidError("RCIID nicht konfiguriert: RCIID_API_KEY fehlt.", {
      code: "RCIID_NOT_CONFIGURED",
    });
  }

  log.info("Submitting case to RCIID", {
    externalCaseId: input.external_case_id,
    walletCount: input.wallets.length,
  });

  const res = await withRetry(() =>
    fetch(`${API_URL}/cases`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(input),
      signal: externalFetchTimeout(30_000),
    })
  );

  const data = (await res.json().catch(() => ({}))) as RciidCase & {
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new RciidError(
      data.message || data.error || `RCIID Case-Submission fehlgeschlagen: HTTP ${res.status}`,
      { code: "RCIID_SUBMIT_FAILED", details: { status: res.status, response: data } }
    );
  }

  log.info("Case submitted to RCIID", { caseId: data.case_id, status: data.status });
  return data;
}

/**
 * Submit a new crypto forensics case with structured case context to RCIID.
 * Includes target_addresses, victim_deposits, known_recipients, exchange_links, evidence_refs.
 */
export async function submitCaseWithContext(input: RciidCaseContextSubmission): Promise<RciidCase> {
  if (!isConfigured()) {
    throw new RciidError("RCIID nicht konfiguriert: RCIID_API_KEY fehlt.", {
      code: "RCIID_NOT_CONFIGURED",
    });
  }

  log.info("Submitting case with context to RCIID", {
    externalCaseId: input.external_case_id,
    walletCount: input.wallets.length,
    hasCaseContext: Boolean(input.case_context),
    targetAddressCount: input.target_addresses?.length ?? 0,
    victimDepositCount: input.victim_deposits?.length ?? 0,
    knownRecipientCount: input.known_recipients?.length ?? 0,
    exchangeLinkCount: input.exchange_links?.length ?? 0,
    evidenceRefCount: input.evidence_refs?.length ?? 0,
  });

  const res = await withRetry(() =>
    fetch(`${API_URL}/cases`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(input),
      signal: externalFetchTimeout(30_000),
    })
  );

  const data = (await res.json().catch(() => ({}))) as RciidCase & {
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new RciidError(
      data.message || data.error || `RCIID Case-Submission fehlgeschlagen: HTTP ${res.status}`,
      { code: "RCIID_SUBMIT_FAILED", details: { status: res.status, response: data } }
    );
  }

  log.info("Case with context submitted to RCIID", { caseId: data.case_id, status: data.status });
  return data;
}

/**
 * Get the current status and progress of a RCIID case.
 */
export async function getCaseStatus(caseId: string): Promise<RciidCaseStatusResponse> {
  if (!isConfigured()) {
    throw new RciidError("RCIID nicht konfiguriert: RCIID_API_KEY fehlt.", {
      code: "RCIID_NOT_CONFIGURED",
    });
  }

  const res = await withRetry(() =>
    fetch(`${API_URL}/cases/${encodeURIComponent(caseId)}`, {
      headers: getHeaders(),
      signal: externalFetchTimeout(),
    })
  );

  const data = (await res.json().catch(() => ({}))) as RciidCaseStatusResponse & {
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new RciidError(
      data.message || data.error || `RCIID Status-Abfrage fehlgeschlagen: HTTP ${res.status}`,
      { code: "RCIID_STATUS_FAILED", details: { caseId, status: res.status } }
    );
  }

  return data;
}

/**
 * Get the detailed investigation timeline for a RCIID case.
 */
export async function getCaseTimeline(caseId: string): Promise<RciidTimelineEvent[]> {
  if (!isConfigured()) {
    throw new RciidError("RCIID nicht konfiguriert.", { code: "RCIID_NOT_CONFIGURED" });
  }

  const res = await withRetry(() =>
    fetch(`${API_URL}/cases/${encodeURIComponent(caseId)}/timeline`, {
      headers: getHeaders(),
      signal: externalFetchTimeout(),
    })
  );

  const data = (await res.json().catch(() => ({}))) as {
    timeline?: RciidTimelineEvent[];
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new RciidError(
      data.message || data.error || `RCIID Timeline-Abfrage fehlgeschlagen: HTTP ${res.status}`,
      { code: "RCIID_TIMELINE_FAILED", details: { caseId, status: res.status } }
    );
  }

  return data.timeline ?? [];
}

/**
 * Get the final investigation report from RCIID.
 */
export async function getCaseReport(caseId: string): Promise<RciidReport> {
  if (!isConfigured()) {
    throw new RciidError("RCIID nicht konfiguriert.", { code: "RCIID_NOT_CONFIGURED" });
  }

  const res = await withRetry(() =>
    fetch(`${API_URL}/cases/${encodeURIComponent(caseId)}/report`, {
      headers: getHeaders(),
      signal: externalFetchTimeout(60_000),
    })
  );

  const data = (await res.json().catch(() => ({}))) as RciidReport & {
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new RciidError(
      data.message || data.error || `RCIID Bericht-Download fehlgeschlagen: HTTP ${res.status}`,
      { code: "RCIID_REPORT_FAILED", details: { caseId, status: res.status } }
    );
  }

  return data;
}

/**
 * Download the report PDF as a Buffer.
 */
export async function downloadReportPdf(caseId: string): Promise<Buffer> {
  if (!isConfigured()) {
    throw new RciidError("RCIID nicht konfiguriert.", { code: "RCIID_NOT_CONFIGURED" });
  }

  const res = await withRetry(() =>
    fetch(`${API_URL}/cases/${encodeURIComponent(caseId)}/report?format=pdf`, {
      headers: { ...getHeaders(), Accept: "application/pdf" },
      signal: externalFetchTimeout(60_000),
    })
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new RciidError(
      `RCIID PDF-Download fehlgeschlagen: HTTP ${res.status} ${detail.slice(0, 200)}`,
      { code: "RCIID_PDF_FAILED", details: { caseId, status: res.status } }
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * List all RCIID cases for this API key.
 */
export async function listCases(opts?: {
  status?: RciidCaseStatus;
  limit?: number;
  offset?: number;
}): Promise<{ cases: RciidCaseStatusResponse[]; total?: number }> {
  if (!isConfigured()) {
    throw new RciidError("RCIID nicht konfiguriert.", { code: "RCIID_NOT_CONFIGURED" });
  }

  const url = new URL(`${API_URL}/cases`);
  if (opts?.status) url.searchParams.set("status", opts.status);
  if (opts?.limit) url.searchParams.set("limit", String(opts.limit));
  if (opts?.offset) url.searchParams.set("offset", String(opts.offset));

  const res = await withRetry(() =>
    fetch(url.toString(), {
      headers: getHeaders(),
      signal: externalFetchTimeout(),
    })
  );

  const data = (await res.json().catch(() => ({}))) as {
    cases?: RciidCaseStatusResponse[];
    total?: number;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new RciidError(
      data.message || data.error || `RCIID Case-Liste fehlgeschlagen: HTTP ${res.status}`,
      { code: "RCIID_LIST_FAILED", details: { status: res.status } }
    );
  }

  return { cases: data.cases ?? [], total: data.total };
}

/**
 * Add additional wallets to an existing RCIID case.
 */
export async function addWalletsToCase(
  caseId: string,
  wallets: RciidWalletSubmission[]
): Promise<{ success: boolean; case_id: string }> {
  if (!isConfigured()) {
    throw new RciidError("RCIID nicht konfiguriert.", { code: "RCIID_NOT_CONFIGURED" });
  }

  const res = await withRetry(() =>
    fetch(`${API_URL}/cases/${encodeURIComponent(caseId)}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ add_wallets: wallets }),
      signal: externalFetchTimeout(),
    })
  );

  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new RciidError(
      data.message || data.error || `RCIID Wallet-Update fehlgeschlagen: HTTP ${res.status}`,
      { code: "RCIID_UPDATE_FAILED", details: { caseId, status: res.status } }
    );
  }

  return { success: data.success ?? true, case_id: caseId };
}

// ── Webhook Verification & Idempotency ──────────────────────────────────────

const rciidIdempotency = createIdempotencyStore(
  "subsumio_rciid_events",
  ["case_id text", "event_type text"],
  { maxInMemory: 5_000 }
);

export async function isWebhookProcessed(eventId: string): Promise<boolean> {
  return rciidIdempotency.isProcessed(eventId);
}

export async function markWebhookProcessed(
  eventId: string,
  caseId?: string,
  eventType?: string
): Promise<void> {
  await rciidIdempotency.markProcessed(eventId, caseId ?? null, eventType ?? null);
}

/**
 * Verifies a RCIID webhook HMAC-SHA256 signature.
 * Constant-time comparison to prevent timing attacks.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signatureHeader, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Parse and validate a webhook event from the raw body.
 */
export function parseWebhookEvent(rawBody: string): RciidWebhookEvent | null {
  try {
    const parsed = JSON.parse(rawBody) as RciidWebhookEvent;
    if (!parsed.event_id || !parsed.case_id || !parsed.event_type) return null;
    return parsed;
  } catch {
    return null;
  }
}
