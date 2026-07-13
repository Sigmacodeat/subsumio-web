/**
 * Statute Amendment Detection — Automated Corpus Freshness Pipeline
 *
 * Fetches statute texts from official sources, compares with local corpus
 * hashes, and detects per-§ amendments. When amendments are detected:
 *   1. Updated §§ are flagged for re-import
 *   2. Existing pipeline outputs citing those §§ get stale alerts
 *   3. Dashboard freshness widget shows the status
 *
 * Supported sources:
 *   - DE: gesetze-im-internet.de (XML API for federal laws)
 *   - AT: RIS-OGD API v2.6 (Bundeskanzleramt)
 *   - CH: fedlex.ch API (Fedlex)
 *   - EU: EUR-Lex webservices
 *
 * Architecture:
 *   1. Fetch current statute text from official API
 *   2. Hash the fetched text (SHA-256, first 16 chars — same as source-registry)
 *   3. Compare with stored hash from previous run
 *   4. If changed → detect which §§ changed (per-§ hash comparison)
 *   5. Return AmendmentReport with changed §§
 */

import { createHash } from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────

export type Jurisdiction = "DE" | "AT" | "CH" | "EU";

export interface StatuteAmendment {
  /** Statute abbreviation, e.g. "BGB", "ABGB" */
  statute_code: string;
  /** Jurisdiction */
  jurisdiction: Jurisdiction;
  /** Changed § number, e.g. "433" */
  paragraph: string;
  /** Type of change */
  change_type: "added" | "modified" | "removed";
  /** Previous content hash */
  old_hash?: string;
  /** New content hash */
  new_hash?: string;
  /** ISO timestamp when the change was detected */
  detected_at: string;
  /** Official source URL */
  source_url: string;
  /** Official announcement date (if available) */
  announcement_date?: string;
}

export interface AmendmentReport {
  jurisdiction: Jurisdiction;
  total_statutes_checked: number;
  total_amendments: number;
  amendments: StatuteAmendment[];
  checked_at: string;
  errors: string[];
}

export interface StatuteSnapshot {
  statute_code: string;
  jurisdiction: Jurisdiction;
  /** Per-§ hashes: { "433": "abc123", "434": "def456", ... } */
  paragraph_hashes: Record<string, string>;
  /** Full text hash */
  full_hash: string;
  snapshot_at: string;
}

// ── Hashing ───────────────────────────────────────────────────────────

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * Split statute text into per-§ chunks and hash each one.
 * Uses the same § heading pattern as split-statute.ts.
 */
export function hashPerParagraph(text: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  const sectionRegex = /^##\s*§\s*(\d+[a-z]?)\b/gm;
  let match: RegExpExecArray | null;
  const positions: Array<{ num: string; start: number }> = [];

  while ((match = sectionRegex.exec(text)) !== null) {
    positions.push({ num: match[1], start: match.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const { num, start } = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1].start : text.length;
    const sectionText = text.slice(start, end).trim();
    hashes[num] = hashText(sectionText);
  }

  return hashes;
}

// ── Amendment Detection ───────────────────────────────────────────────

/**
 * Compare two statute snapshots and detect per-§ amendments.
 */
export function detectAmendments(
  current: StatuteSnapshot,
  previous: StatuteSnapshot | null,
  sourceUrl = ""
): StatuteAmendment[] {
  if (!previous) {
    // First run — all paragraphs are "added"
    return Object.entries(current.paragraph_hashes).map(([para, hash]) => ({
      statute_code: current.statute_code,
      jurisdiction: current.jurisdiction,
      paragraph: para,
      change_type: "added" as const,
      new_hash: hash,
      detected_at: new Date().toISOString(),
      source_url: sourceUrl,
    }));
  }

  const amendments: StatuteAmendment[] = [];
  const now = new Date().toISOString();

  // Modified or added paragraphs
  for (const [para, hash] of Object.entries(current.paragraph_hashes)) {
    const prevHash = previous.paragraph_hashes[para];
    if (!prevHash) {
      amendments.push({
        statute_code: current.statute_code,
        jurisdiction: current.jurisdiction,
        paragraph: para,
        change_type: "added",
        new_hash: hash,
        detected_at: now,
        source_url: sourceUrl,
      });
    } else if (prevHash !== hash) {
      amendments.push({
        statute_code: current.statute_code,
        jurisdiction: current.jurisdiction,
        paragraph: para,
        change_type: "modified",
        old_hash: prevHash,
        new_hash: hash,
        detected_at: now,
        source_url: sourceUrl,
      });
    }
  }

  // Removed paragraphs
  for (const [para, hash] of Object.entries(previous.paragraph_hashes)) {
    if (!current.paragraph_hashes[para]) {
      amendments.push({
        statute_code: current.statute_code,
        jurisdiction: current.jurisdiction,
        paragraph: para,
        change_type: "removed",
        old_hash: hash,
        detected_at: now,
        source_url: sourceUrl,
      });
    }
  }

  return amendments;
}

// ── Snapshot Storage ──────────────────────────────────────────────────

const SNAPSHOT_PREFIX = "statute-snapshot";

export function snapshotKey(jurisdiction: Jurisdiction, statuteCode: string): string {
  return `${SNAPSHOT_PREFIX}:${jurisdiction.toLowerCase()}:${statuteCode.toLowerCase()}`;
}

/**
 * In-memory snapshot store (for tests).
 * In production, this would be backed by a DB table or file store.
 */
const snapshotStore = new Map<string, StatuteSnapshot>();

export function storeSnapshot(snapshot: StatuteSnapshot): void {
  const key = snapshotKey(snapshot.jurisdiction, snapshot.statute_code);
  snapshotStore.set(key, snapshot);
}

export function loadSnapshot(
  jurisdiction: Jurisdiction,
  statuteCode: string
): StatuteSnapshot | null {
  const key = snapshotKey(jurisdiction, statuteCode);
  return snapshotStore.get(key) ?? null;
}

export function clearSnapshots(): void {
  snapshotStore.clear();
}

// ── Official Source Fetchers ──────────────────────────────────────────

/**
 * Fetch statute text from official German source (gesetze-im-internet.de).
 *
 * The API provides XML for all federal laws. We fetch the norm list,
 * then get the full text for each statute.
 *
 * Note: This is a stub that defines the interface. The actual HTTP
 * fetching is done in the cron route to keep this module pure-testable.
 */
export async function fetchDeStatute(
  statuteCode: string,
  _fetchFn?: typeof fetch
): Promise<{ text: string; sourceUrl: string; announcementDate?: string } | null> {
  const fetchFn = _fetchFn ?? fetch;
  const url = `https://www.gesetze-im-internet.de/${statuteCode.toLowerCase()}/xml.xml`;

  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const xml = await res.text();
    // Extract text content from XML (simplified — real impl would parse XML properly)
    // Preserve newlines so § heading detection (anchored on ^) still works
    const text = xml
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ ]+/g, "\n")
      .trim();
    return { text, sourceUrl: url };
  } catch {
    return null;
  }
}

/**
 * Fetch statute text from official Austrian source (RIS-OGD).
 */
export async function fetchAtStatute(
  statuteCode: string,
  _fetchFn?: typeof fetch
): Promise<{ text: string; sourceUrl: string; announcementDate?: string } | null> {
  const fetchFn = _fetchFn ?? fetch;
  const url = `https://data.bka.gv.at/ris/api/v2.6/bundesnormen?abk=${encodeURIComponent(statuteCode)}`;

  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: Array<{ content?: string; datum?: string }> };
    const first = json.results?.[0];
    if (!first?.content) return null;
    return {
      text: first.content,
      sourceUrl: url,
      announcementDate: first.datum,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch statute text from official Swiss source (fedlex.ch).
 */
export async function fetchChStatute(
  statuteCode: string,
  _fetchFn?: typeof fetch
): Promise<{ text: string; sourceUrl: string; announcementDate?: string } | null> {
  const fetchFn = _fetchFn ?? fetch;
  // fedlex doesn't have a simple text API — this would use the SPARQL endpoint
  // or the REST API with content negotiation
  const url = `https://www.fedlex.admin.ch/api/v1/documents?abbreviation=${encodeURIComponent(statuteCode)}`;

  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: Array<{ text?: string; date?: string }> };
    const first = json.results?.[0];
    if (!first?.text) return null;
    return {
      text: first.text,
      sourceUrl: url,
      announcementDate: first.date,
    };
  } catch {
    return null;
  }
}

// ── Full Amendment Check ──────────────────────────────────────────────

/**
 * Fetch statute text from official EU source (EUR-Lex webservices).
 * Uses the EUR-Lex REST API with content negotiation for document retrieval.
 * CELEX number format: e.g. "32010R0013" for Regulation No 13/2010.
 */
export async function fetchEuStatute(
  statuteCode: string,
  _fetchFn?: typeof fetch
): Promise<{ text: string; sourceUrl: string; announcementDate?: string } | null> {
  const fetchFn = _fetchFn ?? fetch;
  // EUR-Lex webservices API — requires CELEX number or document reference
  const celex = statuteCode.replace(/[^0-9A-Z]/gi, "").toUpperCase();
  const url = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celex}&qid=1`;

  try {
    const res = await fetchFn(url);
    if (!res.ok) return null;
    const html = await res.text();
    // Extract text content from HTML (strip tags)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!text || text.length < 50) return null;
    return {
      text,
      sourceUrl: url,
    };
  } catch {
    return null;
  }
}

/**
 * Run a full amendment check for a single statute.
 *
 * 1. Fetch current text from official source
 * 2. Hash per-§
 * 3. Compare with previous snapshot
 * 4. Store new snapshot
 * 5. Return amendments
 */
export async function checkStatuteAmendments(
  jurisdiction: Jurisdiction,
  statuteCode: string,
  fetchFn?: typeof fetch
): Promise<{ amendments: StatuteAmendment[]; snapshot: StatuteSnapshot | null; error?: string }> {
  let fetchResult: { text: string; sourceUrl: string; announcementDate?: string } | null;

  switch (jurisdiction) {
    case "DE":
      fetchResult = await fetchDeStatute(statuteCode, fetchFn);
      break;
    case "AT":
      fetchResult = await fetchAtStatute(statuteCode, fetchFn);
      break;
    case "CH":
      fetchResult = await fetchChStatute(statuteCode, fetchFn);
      break;
    case "EU":
      fetchResult = await fetchEuStatute(statuteCode, fetchFn);
      break;
    default:
      return { amendments: [], snapshot: null, error: `Unsupported jurisdiction: ${jurisdiction}` };
  }

  if (!fetchResult) {
    recordConnectorHealth(jurisdiction, false, `Failed to fetch ${statuteCode}`);
    return {
      amendments: [],
      snapshot: null,
      error: `Failed to fetch ${statuteCode} from ${jurisdiction} source`,
    };
  }

  const paragraphHashes = hashPerParagraph(fetchResult.text);
  const fullHash = hashText(fetchResult.text);
  recordConnectorHealth(jurisdiction, true);
  const snapshot: StatuteSnapshot = {
    statute_code: statuteCode,
    jurisdiction,
    paragraph_hashes: paragraphHashes,
    full_hash: fullHash,
    snapshot_at: new Date().toISOString(),
  };

  const previous = loadSnapshot(jurisdiction, statuteCode);
  const amendments = detectAmendments(snapshot, previous, fetchResult.sourceUrl);

  // Add announcement date to amendments
  for (const a of amendments) {
    if (fetchResult.announcementDate) {
      a.announcement_date = fetchResult.announcementDate;
    }
  }

  storeSnapshot(snapshot);

  return { amendments, snapshot };
}

/**
 * Run amendment checks for multiple statutes across jurisdictions.
 */
export async function runAmendmentCheck(
  statutes: Array<{ jurisdiction: Jurisdiction; statuteCode: string }>,
  fetchFn?: typeof fetch
): Promise<AmendmentReport[]> {
  const reports: AmendmentReport[] = [];

  // Group by jurisdiction
  const byJurisdiction = new Map<Jurisdiction, string[]>();
  for (const { jurisdiction, statuteCode } of statutes) {
    if (!byJurisdiction.has(jurisdiction)) {
      byJurisdiction.set(jurisdiction, []);
    }
    byJurisdiction.get(jurisdiction)!.push(statuteCode);
  }

  for (const [jurisdiction, codes] of byJurisdiction) {
    const allAmendments: StatuteAmendment[] = [];
    const errors: string[] = [];
    let checked = 0;

    for (const code of codes) {
      const result = await checkStatuteAmendments(jurisdiction, code, fetchFn);
      checked++;
      if (result.error) {
        errors.push(result.error);
      } else {
        allAmendments.push(...result.amendments);
      }
    }

    reports.push({
      jurisdiction,
      total_statutes_checked: checked,
      total_amendments: allAmendments.length,
      amendments: allAmendments,
      checked_at: new Date().toISOString(),
      errors,
    });
  }

  return reports;
}

// ── Stale Citation Alert ──────────────────────────────────────────────

export interface StaleCitationAlert {
  /** The pipeline output / synthesis slug that contains the stale citation */
  output_slug: string;
  /** The § citation that is now stale */
  citation: string;
  /** The statute code */
  statute_code: string;
  /** The § number */
  paragraph: string;
  /** Type of amendment */
  change_type: "added" | "modified" | "removed";
  /** When the amendment was detected */
  detected_at: string;
  /** Severity: removed is critical, modified is high, added is low */
  severity: "critical" | "high" | "low";
}

/**
 * Given a list of amendments and a list of pipeline outputs (with their citations),
 * determine which outputs have stale citations.
 *
 * @param amendments - Detected amendments
 * @param outputs - Pipeline outputs with their citations [{ slug, citations: ["§ 433 BGB", ...] }]
 * @returns Stale citation alerts
 */
export function findStaleCitations(
  amendments: StatuteAmendment[],
  outputs: Array<{ slug: string; citations: string[] }>
): StaleCitationAlert[] {
  const alerts: StaleCitationAlert[] = [];

  for (const amendment of amendments) {
    const citePattern = new RegExp(`§+\\s*${amendment.paragraph}\\b`, "i");

    for (const output of outputs) {
      const hasCitation = output.citations.some((c) => citePattern.test(c));
      if (hasCitation) {
        alerts.push({
          output_slug: output.slug,
          citation: `§ ${amendment.paragraph} ${amendment.statute_code}`,
          statute_code: amendment.statute_code,
          paragraph: amendment.paragraph,
          change_type: amendment.change_type,
          detected_at: amendment.detected_at,
          severity:
            amendment.change_type === "removed"
              ? "critical"
              : amendment.change_type === "modified"
                ? "high"
                : "low",
        });
      }
    }
  }

  return alerts;
}

// ── Freshness Summary ─────────────────────────────────────────────────

export interface FreshnessSummary {
  total_statutes: number;
  fresh: number;
  stale: number;
  error: number;
  last_check: string | null;
  amendments_detected: number;
  stale_citations: number;
  by_jurisdiction: Record<
    Jurisdiction,
    {
      total: number;
      fresh: number;
      stale: number;
      error: number;
      amendments: number;
    }
  >;
}

/**
 * Build a freshness summary from amendment reports.
 */
export function buildFreshnessSummary(
  reports: AmendmentReport[],
  staleAlerts: StaleCitationAlert[]
): FreshnessSummary {
  const byJurisdiction: FreshnessSummary["by_jurisdiction"] = {
    DE: { total: 0, fresh: 0, stale: 0, error: 0, amendments: 0 },
    AT: { total: 0, fresh: 0, stale: 0, error: 0, amendments: 0 },
    CH: { total: 0, fresh: 0, stale: 0, error: 0, amendments: 0 },
    EU: { total: 0, fresh: 0, stale: 0, error: 0, amendments: 0 },
  };

  let totalStatutes = 0;
  let totalFresh = 0;
  let totalStale = 0;
  let totalError = 0;
  let totalAmendments = 0;
  let lastCheck: string | null = null;

  for (const report of reports) {
    const jur = report.jurisdiction;
    byJurisdiction[jur].total = report.total_statutes_checked;
    byJurisdiction[jur].amendments = report.total_amendments;
    byJurisdiction[jur].error = report.errors.length;
    byJurisdiction[jur].stale = report.total_amendments > 0 ? 1 : 0; // At least one amendment → stale
    byJurisdiction[jur].fresh =
      report.total_statutes_checked - report.errors.length - (report.total_amendments > 0 ? 1 : 0);

    totalStatutes += report.total_statutes_checked;
    totalError += report.errors.length;
    totalAmendments += report.total_amendments;
    if (report.total_amendments > 0) totalStale++;
    else totalFresh++;

    if (!lastCheck || report.checked_at > lastCheck) {
      lastCheck = report.checked_at;
    }
  }

  return {
    total_statutes: totalStatutes,
    fresh: totalFresh,
    stale: totalStale,
    error: totalError,
    last_check: lastCheck,
    amendments_detected: totalAmendments,
    stale_citations: staleAlerts.length,
    by_jurisdiction: byJurisdiction,
  };
}

// ── Connector Health Monitoring ───────────────────────────────────────

export interface ConnectorHealth {
  jurisdiction: Jurisdiction;
  status: "healthy" | "degraded" | "down";
  last_success: string | null;
  last_failure: string | null;
  consecutive_failures: number;
  total_checks: number;
  total_failures: number;
  error_message?: string;
}

const connectorHealthMap = new Map<Jurisdiction, ConnectorHealth>();

/**
 * Record a connector health check result.
 */
export function recordConnectorHealth(
  jurisdiction: Jurisdiction,
  success: boolean,
  errorMessage?: string
): void {
  const existing = connectorHealthMap.get(jurisdiction);
  const now = new Date().toISOString();

  if (!existing) {
    connectorHealthMap.set(jurisdiction, {
      jurisdiction,
      status: success ? "healthy" : "down",
      last_success: success ? now : null,
      last_failure: success ? null : now,
      consecutive_failures: success ? 0 : 1,
      total_checks: 1,
      total_failures: success ? 0 : 1,
      error_message: success ? undefined : errorMessage,
    });
    return;
  }

  existing.total_checks++;
  if (success) {
    existing.last_success = now;
    existing.consecutive_failures = 0;
    existing.error_message = undefined;
    existing.status = "healthy";
  } else {
    existing.last_failure = now;
    existing.consecutive_failures++;
    existing.total_failures++;
    existing.error_message = errorMessage;
    existing.status = existing.consecutive_failures >= 3 ? "down" : "degraded";
  }
}

/**
 * Get connector health for a jurisdiction.
 */
export function getConnectorHealth(jurisdiction: Jurisdiction): ConnectorHealth | null {
  return connectorHealthMap.get(jurisdiction) ?? null;
}

/**
 * Get health status for all connectors.
 */
export function getAllConnectorHealth(): ConnectorHealth[] {
  return Array.from(connectorHealthMap.values());
}

/**
 * Check if a connector is operational (healthy or degraded, not down).
 */
export function isConnectorOperational(jurisdiction: Jurisdiction): boolean {
  const health = connectorHealthMap.get(jurisdiction);
  if (!health) return true; // No data yet — assume operational
  return health.status !== "down";
}
