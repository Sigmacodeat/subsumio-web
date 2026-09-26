import { ENGINE_URL } from "@/lib/engine";
import { engineWriteBestEffort } from "@/lib/engine-write";
import { listEnginePages } from "@/lib/engine-pages";
import { caseContentWithAktenblatt, isCaseSlug } from "@/lib/aktenblatt";
import { logger } from "@/lib/logger";

const log = logger("aktenblatt-refresh");

/** Safety stop for one matter's standalone deadlines (engine-filtered). */
const MATTER_DEADLINES_MAX = 10_000;

/**
 * Per-matter coalescing: at most one refresh runs per (brain, matter); writes
 * that arrive meanwhile schedule exactly one follow-up run, which then sees
 * all of them. A pipeline creating 30 deadlines of one matter triggers two
 * runs, not 30 parallel ones.
 */
const inFlight = new Map<string, { rerun: boolean; headers: Record<string, string> }>();

function refreshKey(headers: Record<string, string>, slug: string): string {
  return `${headers["x-subsumio-source"] ?? ""}\u0000${slug}`;
}

/**
 * Re-render the Aktenblatt after a metadata merge. Best-effort: a failure here
 * leaves the matter with a stale (but still valid) Aktenblatt — never with one
 * rendered from an incomplete deadline list.
 */
export function refreshAktenblatt(headers: Record<string, string>, slug: string): Promise<void> {
  const key = refreshKey(headers, slug);
  const running = inFlight.get(key);
  if (running) {
    running.rerun = true;
    running.headers = headers;
    return Promise.resolve();
  }
  const state = { rerun: false, headers };
  inFlight.set(key, state);
  return (async () => {
    try {
      do {
        state.rerun = false;
        await renderAktenblatt(state.headers, slug);
      } while (state.rerun);
    } finally {
      inFlight.delete(key);
    }
  })();
}

async function renderAktenblatt(headers: Record<string, string>, slug: string): Promise<void> {
  try {
    const path = slug.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const page = (await res.json()) as {
      title?: string;
      content?: string;
      frontmatter?: Record<string, unknown>;
    };
    // Deadlines are usually standalone pages linked by case_slug — the engine
    // selects this matter's rows in SQL. Strict + complete: a partial list
    // would drop deadlines from the Aktenblatt, so skip the refresh instead.
    const matterDeadlines = (await listEnginePages(headers, "legal_deadline", MATTER_DEADLINES_MAX, {
      timeoutMs: 10_000,
      strict: true,
      failOnTruncate: true,
      frontmatter: { case_slug: slug },
    })) as unknown as Array<Record<string, unknown>>;
    const linkedDeadlines = matterDeadlines.filter(
      (d) => ((d.frontmatter ?? {}) as Record<string, unknown>).case_slug === slug
    );
    const next = caseContentWithAktenblatt(
      page.content ?? "",
      page.title ?? "",
      page.frontmatter ?? {},
      {
        linkedDeadlines,
      }
    );
    if (next === (page.content ?? "").trim()) return;
    // Best effort, but a refused write is logged instead of passing silently.
    await engineWriteBestEffort(
      `${ENGINE_URL}/api/pages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ slug, merge: true, content: next }),
        signal: AbortSignal.timeout(15_000),
      },
      "Aktenblatt"
    );
  } catch (e) {
    log.warn("[pages] aktenblatt refresh skipped:", e instanceof Error ? e.message : String(e));
  }
}

export async function refreshAktenblattForDeadline(
  headers: Record<string, string>,
  deadlineSlug: string,
  fm: Record<string, unknown> | undefined
): Promise<void> {
  try {
    let caseSlug = typeof fm?.case_slug === "string" ? fm.case_slug : "";
    if (!caseSlug) {
      const path = deadlineSlug.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${ENGINE_URL}/api/pages/${path}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return;
      const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
      caseSlug = typeof page.frontmatter?.case_slug === "string" ? page.frontmatter.case_slug : "";
    }
    if (isCaseSlug(caseSlug)) await refreshAktenblatt(headers, caseSlug);
  } catch {
    /* best-effort */
  }
}
