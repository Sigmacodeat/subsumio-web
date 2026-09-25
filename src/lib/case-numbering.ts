import { createServerBrainClient } from "@/lib/server-brain";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { ENGINE_URL, enginePatchPage } from "@/lib/engine";
import { readCurrentPage } from "@/lib/page-write-guards";
import { logger } from "@/lib/logger";

const log = logger("lib/case-numbering");

/**
 * Aktenzeichen-Nummernkreis: a yearly-resetting sequential number per
 * Kanzlei (brain), "<YY>-<0001>", optionally prefixed with the Kanzlei's
 * Kürzel.
 *
 * Numbers are allocated with ONE atomic Postgres statement (same pattern as
 * the invoice numbers, src/lib/invoice-numbering.ts): two simultaneous "Neue
 * Akte" requests can never get the same number. The counter never goes below
 * the legacy counter page (legal/settings/case-number-counter) that earlier
 * versions kept in the engine, so existing firms continue their sequence.
 * If that page cannot be read (timeout, engine error) nothing is allocated —
 * a failed read must not look like "no counter yet" and restart at 0001.
 */

const COUNTER_SLUG = "legal/settings/case-number-counter";

const ensureSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_case_counters (
    brain_id text NOT NULL,
    year integer NOT NULL,
    last_number integer NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brain_id, year)
  )
`);

/** Fallback for environments without Postgres (dev/tests). */
const memoryCounters = new Map<string, number>();

/** Calendar year in Vienna — a matter opened on 31.12. at 23:30 is still that year. */
export function viennaYear(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric" }).format(now)
  );
}

export function formatCaseNumber(year: number, n: number, prefix?: string): string {
  const yy = String(year).slice(-2);
  const num = String(n).padStart(4, "0");
  return prefix?.trim() ? `${prefix.trim()}-${yy}-${num}` : `${yy}-${num}`;
}

export class CaseNumberAllocationError extends Error {}

/** Highest number the legacy engine counter page has already handed out this year. */
async function legacyFloor(headers: Record<string, string>, year: number): Promise<number> {
  const read = await readCurrentPage(ENGINE_URL, headers, COUNTER_SLUG);
  if (read.kind === "error") {
    throw new CaseNumberAllocationError("Aktenzeichen-Zähler konnte nicht gelesen werden");
  }
  if (read.kind === "missing") return 0;
  const fm = read.page.frontmatter ?? {};
  return fm.year === year && typeof fm.next === "number" && fm.next > 1 ? fm.next - 1 : 0;
}

async function nextNumber(brainId: string, year: number, floor: number): Promise<number> {
  const pool = getSharedPgPool();
  if (!pool) {
    const key = `${brainId}:${year}`;
    const next = Math.max(memoryCounters.get(key) ?? 0, floor) + 1;
    memoryCounters.set(key, next);
    return next;
  }
  await ensureSchema();
  const { rows } = await pool.query<{ last_number: number }>(
    `INSERT INTO subsumio_case_counters (brain_id, year, last_number)
     VALUES ($1, $2, $3 + 1)
     ON CONFLICT (brain_id, year)
     DO UPDATE SET last_number = GREATEST(subsumio_case_counters.last_number, $3) + 1,
                   updated_at = now()
     RETURNING last_number`,
    [brainId, year, floor]
  );
  const n = rows[0]?.last_number;
  if (typeof n !== "number") throw new CaseNumberAllocationError("Zähler lieferte keine Nummer");
  return n;
}

/**
 * Allocate the next case number for this brain. `prefix` is an optional
 * Kanzlei-Kürzel (e.g. "MK"); when omitted, the firm's configured
 * `aktenzeichenPrefix` from the Kanzlei settings is used.
 */
export async function allocateCaseNumber(
  headers: Record<string, string>,
  brainId: string,
  prefix?: string,
  now = new Date()
): Promise<string> {
  if (!prefix?.trim()) {
    const brain = createServerBrainClient(headers);
    const settingsPage = await brain.getPage("legal/settings/kanzlei").catch(() => null);
    const configured = (settingsPage?.frontmatter as Record<string, unknown> | undefined)
      ?.aktenzeichenPrefix;
    if (typeof configured === "string" && configured.trim()) prefix = configured;
  }
  const year = viennaYear(now);
  const floor = await legacyFloor(headers, year);
  const n = await nextNumber(brainId, year, floor);

  // Keep the legacy page in step (best effort) so a later reader of it — or
  // an environment without Postgres after a restart — never goes backwards.
  void enginePatchPage(headers, {
    slug: COUNTER_SLUG,
    title: "Aktenzeichen-Nummernkreis",
    type: "kanzlei_settings",
    frontmatter: { year, next: n + 1 },
  })
    .then((res) => {
      if (!res.ok) log.warn("[case-numbering] legacy counter not updated", { status: res.status });
    })
    .catch(() => {});

  return formatCaseNumber(year, n, prefix);
}
