/**
 * Does a firm's brain still hold records that must be kept? Asked before the
 * data of a whole brain is destroyed (self-deletion of a single-lawyer firm,
 * and again right before the delayed purge):
 *  - closed/archived matters whose retention period runs (§ 12 RAO,
 *    § 132 BAO — src/lib/case-retention.ts), and
 *  - receipts stamped for tax retention (`gobd_retention`, § 132 BAO) whose
 *    period has not ended.
 * Legal holds are checked separately (src/lib/legal-hold-check.ts).
 *
 * Fail-closed: a failed or truncated read answers "unknown", never "clear".
 */

import { listEnginePages } from "@/lib/engine-pages";
import { caseRetentionState } from "@/lib/case-retention";
import { retentionUntil } from "@/lib/gobd";

export type FirmRetentionResult =
  | { status: "clear" }
  | { status: "retained"; cases: string[]; receipts: number; until: string | null }
  | { status: "unknown" };

const SCAN_MAX = 100_000;
const RECEIPT_TYPES = ["invoice", "document"] as const;

function endOfDayMs(value: string): number | null {
  const raw = value.trim();
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? t + 86_400_000 - 1 : t;
}

/** A stamped receipt still inside its period? Unreadable stamp → yes (fail-closed). */
function receiptRetained(fm: Record<string, unknown>, now: Date): string | true | null {
  if (fm.gobd_retention !== true) return null;
  const candidates: string[] = [];
  if (typeof fm.retention_until === "string" && fm.retention_until.trim()) {
    candidates.push(fm.retention_until.trim().slice(0, 10));
  }
  const hashed = typeof fm.hashed_at === "string" ? Date.parse(fm.hashed_at) : NaN;
  if (Number.isFinite(hashed)) candidates.push(retentionUntil(new Date(hashed)));
  if (candidates.length === 0) return true;
  let latest: { label: string; ms: number } | null = null;
  for (const c of candidates) {
    const ms = endOfDayMs(c);
    if (ms === null) return true;
    if (!latest || ms > latest.ms) latest = { label: c, ms };
  }
  return latest && now.getTime() <= latest.ms ? latest.label : null;
}

export async function checkFirmRetention(
  headers: Record<string, string>,
  now: Date = new Date()
): Promise<FirmRetentionResult> {
  try {
    const cases: string[] = [];
    let receipts = 0;
    let until: string | null = null;
    const later = (d: string | null) => {
      if (d && (!until || d > until)) until = d;
    };

    const matters = await listEnginePages(headers, "legal_case", SCAN_MAX, {
      includeTombstoned: true,
      strict: true,
    });
    if (matters.length >= SCAN_MAX) return { status: "unknown" };
    for (const m of matters) {
      const state = caseRetentionState(m.frontmatter, now);
      if (state.running) {
        cases.push(m.slug);
        later(state.until);
      }
    }

    for (const type of RECEIPT_TYPES) {
      const pages = await listEnginePages(headers, type, SCAN_MAX, {
        includeTombstoned: true,
        strict: true,
      });
      if (pages.length >= SCAN_MAX) return { status: "unknown" };
      for (const p of pages) {
        const kept = receiptRetained(p.frontmatter ?? {}, now);
        if (kept === null) continue;
        receipts++;
        if (typeof kept === "string") later(kept);
      }
    }

    if (cases.length === 0 && receipts === 0) return { status: "clear" };
    return { status: "retained", cases, receipts, until };
  } catch {
    return { status: "unknown" };
  }
}

/** German refusal text with the export hint. */
export function retainedMessage(r: { cases: string[]; receipts: number; until: string | null }) {
  const parts: string[] = [];
  if (r.cases.length > 0) parts.push(`${r.cases.length} abgeschlossene Akte(n)`);
  if (r.receipts > 0) parts.push(`${r.receipts} aufbewahrungspflichtige(r) Beleg(e)`);
  const bis = r.until ? ` (Fristende spätestens ${r.until.split("-").reverse().join(".")})` : "";
  return (
    `Ihr Datenbestand enthält ${parts.join(" und ")}, die der gesetzlichen Aufbewahrungspflicht ` +
    `unterliegen (§ 12 RAO, § 132 BAO)${bis}. Das Konto kann deshalb jetzt nicht gelöscht werden. ` +
    `Laden Sie vorher einen vollständigen Export herunter (Einstellungen → Datenexport) und ` +
    `wenden Sie sich für eine geordnete Übergabe an support@subsum.io.`
  );
}
