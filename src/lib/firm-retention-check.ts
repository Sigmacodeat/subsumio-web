/**
 * Does a firm's brain still hold records that must be kept? Asked before the
 * data of a whole brain is destroyed (self-deletion of a single-lawyer firm,
 * and again right before the delayed purge):
 *  - closed/archived matters whose retention period runs (§ 12 RAO,
 *    § 132 BAO — src/lib/case-retention.ts), and
 *  - receipts stamped for tax retention (`gobd_retention`, § 132 BAO) whose
 *    period has not ended, and
 *  - OPEN matters (neither archived nor in the Papierkorb): an open Handakte is
 *    kept as well — the firm closes/archives it first, or moves a matter
 *    created by mistake to the Papierkorb. The seeded demo matter
 *    (`demo: true`) does not count.
 * Legal holds are checked separately (src/lib/legal-hold-check.ts).
 *
 * Fail-closed: a failed or truncated read answers "unknown", never "clear".
 */

import { listEnginePages } from "@/lib/engine-pages";
import { caseRetentionState } from "@/lib/case-retention";
import { retentionUntil } from "@/lib/gobd";

export type FirmRetentionResult =
  | { status: "clear" }
  | {
      status: "retained";
      cases: string[];
      receipts: number;
      until: string | null;
      /** Open matters (not archived, not deleted). */
      openCases?: string[];
    }
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
    const openCases: string[] = [];
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
      } else if (
        !state.applies &&
        m.frontmatter?.status !== "tombstoned" &&
        m.frontmatter?.demo !== true
      ) {
        openCases.push(m.slug);
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

    if (cases.length === 0 && receipts === 0 && openCases.length === 0) return { status: "clear" };
    return { status: "retained", cases, receipts, until, openCases };
  } catch {
    return { status: "unknown" };
  }
}

/** German refusal text with the export hint. */
export function retainedMessage(r: {
  cases: string[];
  receipts: number;
  until: string | null;
  openCases?: string[];
}) {
  const open = r.openCases?.length ?? 0;
  if (open > 0 && r.cases.length === 0 && r.receipts === 0) {
    return (
      `Ihr Datenbestand enthält ${open} offene Akte(n). Auch offene Handakten sind aufzubewahren ` +
      `(§ 12 RAO). Schließen bzw. archivieren Sie sie zuerst oder verschieben Sie irrtümlich ` +
      `angelegte Akten in den Papierkorb. Laden Sie vorher einen vollständigen Export herunter ` +
      `(Einstellungen → Datenexport).`
    );
  }
  const parts: string[] = [];
  if (open > 0) parts.push(`${open} offene Akte(n)`);
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
