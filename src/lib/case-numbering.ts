import { createServerBrainClient } from "@/lib/server-brain";
import { logger } from "@/lib/logger";

const log = logger("lib/case-numbering");

/**
 * Aktenzeichen-Nummernkreis.
 *
 * Before this, "Neue Akte" had no automatic case-number allocation: when a
 * lawyer left the Aktenzeichen field empty, the form fell back to
 * `Date.now().toString(36)` as both the slug and the displayed case_number
 * (cases/new/page.tsx) — an unprofessional, unrecognizable "number" no
 * Kanzlei would want on a Schriftsatz. The engine has its own
 * generateCaseNumber/LegalCaseRepository.create (server/src/core/legal/
 * repository.ts) but it's CLI/engine-internal, race-prone (COUNT(*) at
 * create time, not an atomic increment), and the web app's "New Case" flow
 * never calls it.
 *
 * This allocates a yearly-resetting sequential number per Kanzlei (brain),
 * stored on a single counter page (legal/settings/case-number-counter),
 * using the same read-write-verify-retry pattern as the time-entries race
 * fix (src/app/api/time/route.ts) — the engine has no atomic increment
 * primitive reachable from the web layer, so this narrows the race rather
 * than eliminating it outright. Format: "<YY>-<0001>", optionally prefixed
 * with the Kanzlei's own Kürzel if one is configured.
 */

const COUNTER_SLUG = "legal/settings/case-number-counter";
const MAX_ATTEMPTS = 5;

interface CounterState {
  year: number;
  next: number;
}

function currentYear(): number {
  return new Date().getFullYear();
}

function readCounter(frontmatter: Record<string, unknown> | undefined): CounterState {
  const year = frontmatter?.year;
  const next = frontmatter?.next;
  if (typeof year === "number" && typeof next === "number" && year === currentYear()) {
    return { year, next };
  }
  // No counter page yet, or it's from a previous year — start fresh for
  // the current year. A stale prior-year counter is intentionally NOT
  // carried forward: Austrian Kanzlei practice numbers cases per year.
  return { year: currentYear(), next: 1 };
}

export class CaseNumberAllocationError extends Error {}

/**
 * Allocate the next case number for this brain. `prefix` is an optional
 * Kanzlei-Kürzel (e.g. "MK" for a firm's initials); omit for a bare
 * "<YY>-<0001>" number.
 */
export async function allocateCaseNumber(
  headers: Record<string, string>,
  prefix?: string
): Promise<string> {
  const brain = createServerBrainClient(headers);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const page = await brain.getPage(COUNTER_SLUG).catch(() => null);
    const current = readCounter(page?.frontmatter as Record<string, unknown> | undefined);
    const allocated = current.next;
    const nextState: CounterState = { year: current.year, next: current.next + 1 };

    const nextStateFm: Record<string, unknown> = { year: nextState.year, next: nextState.next };
    if (page) {
      await brain.updatePage({
        slug: COUNTER_SLUG,
        frontmatter: nextStateFm,
      });
    } else {
      await brain.createPage({
        slug: COUNTER_SLUG,
        title: "Aktenzeichen-Nummernkreis",
        type: "kanzlei_settings",
        content:
          "Interner Zähler für automatisch vergebene Aktenzeichen. Nicht manuell bearbeiten.",
        frontmatter: nextStateFm,
      });
    }

    // Verify: re-read and confirm our allocated number is still the one
    // the counter has "used" — if a concurrent allocation raced us and
    // landed its write after ours (or before, with our write based on a
    // stale read), the stored `next` won't match what we expect. Retry
    // with a fresh read rather than risk two cases sharing one number.
    const verifyPage = await brain.getPage(COUNTER_SLUG).catch(() => null);
    const verifyNext = (verifyPage?.frontmatter as Record<string, unknown> | undefined)?.next;
    if (verifyNext === nextState.next) {
      const yy = String(nextState.year).slice(-2);
      const num = String(allocated).padStart(4, "0");
      return prefix?.trim() ? `${prefix.trim()}-${yy}-${num}` : `${yy}-${num}`;
    }
    log.warn("[case-numbering] allocation conflict, retrying", { attempt, allocated });
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60));
  }
  log.error("[case-numbering] allocation exhausted retries");
  throw new CaseNumberAllocationError("Aktenzeichen konnte nicht vergeben werden");
}
